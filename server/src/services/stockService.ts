import { prisma } from '../prisma';
import { monthlyConsumption } from './articleService';
import { activeAllocations } from './reservationStock';
import { Prisma } from '@prisma/client';
import { dec, toNumber } from '../utils/decimal';

export interface Thresholds {
  stockSecurite: number;
  stockMin: number;
  stockAlerte: number;
  stockMax: number;
  couvStock: number;
  observation: string;
  /** Unite de mesure de l'article : elle accompagne les seuils pour que le client
   *  affiche les quantités dans la bonne unité. */
  unit?: string | null;
}

interface ThresholdSettings {
  jourSec: number;
  jourMin: number;
  coefMax: number;
  coefAlerte: number;
}

// Cache court des parametres de seuils (evite 4 requetes par article dans les listes).
let settingsCache: { at: number; value: ThresholdSettings } | null = null;

async function getThresholdSettings(): Promise<ThresholdSettings> {
  if (settingsCache && Date.now() - settingsCache.at < 5000) return settingsCache.value;
  const [sSec, sMin, sMax, sCoef] = await Promise.all([
    prisma.setting.findUnique({ where: { code: 'JOURS_SECURITE' } }),
    prisma.setting.findUnique({ where: { code: 'JOURS_MIN' } }),
    prisma.setting.findUnique({ where: { code: 'COEF_MAXI' } }),
    prisma.setting.findUnique({ where: { code: 'COEF_ALERTE' } }),
  ]);
  const value: ThresholdSettings = {
    jourSec: Number(sSec?.value ?? 9),
    jourMin: Number(sMin?.value ?? 21),
    coefMax: Number(sMax?.value ?? 0.5),
    coefAlerte: Number(sCoef?.value ?? 1.05),
  };
  settingsCache = { at: Date.now(), value };
  return value;
}

/** Calcul des seuils (formules conservees de l'Excel, parametres modifiables). */
export async function computeThresholds(
  articleId: number,
  stockDisponible: number,
  encours = 0,
  unit: string | null = null,
): Promise<Thresholds> {
  const { jourSec, jourMin, coefMax, coefAlerte } = await getThresholdSettings();

  const cons = await monthlyConsumption(articleId);
  const consJ = cons.cMax / 30;
  const stockSecurite = (cons.avg / 30) * jourSec;
  const stockMin = (cons.avg / 30) * jourMin;
  const stockAlerte = stockSecurite + stockMin;
  const stockMax = cons.cMax * (1 + coefMax);
  const stockVirtuel = stockDisponible + encours;
  const couvStock = consJ > 0 ? stockDisponible / consJ : 0;

  let observation = 'OK';
  if (stockVirtuel < stockMin) observation = 'RUPTURE IMMINENTE';
  else if (stockVirtuel <= stockAlerte * coefAlerte) observation = 'ALERTE';
  else if (stockVirtuel <= stockSecurite) observation = 'COMMANDER';
  else if (stockVirtuel >= stockMax) observation = 'SURSTOCK';

  return {
    stockSecurite: Number(stockSecurite.toFixed(3)),
    stockMin: Number(stockMin.toFixed(3)),
    stockAlerte: Number(stockAlerte.toFixed(3)),
    stockMax: Number(stockMax.toFixed(3)),
    couvStock: Number(couvStock.toFixed(3)),
    observation,
    unit,
  };
}

export interface StockRow {
  articleId: number;
  articleCode: string;
  designation: string;
  category: string | null;
  family: string | null;
  unit: string | null;
  depot?: string | null;
  location?: string | null;
  lot?: string | null;
  lotId?: number | null;
  expiryDate?: Date | null;
  /** Stock BRUT : somme des mouvements actifs, reservations confondues. */
  quantity: number;
  /**
   * D20 : quantite promisee par les reservations ACTIF, cumulee comme `quantity`
   * (meme regroupement, memes filtres). Une reservation ne retire pas de stock :
   * elle fige des lots. Cette colonne est donc une information, pas un mouvement.
   */
  reservedQuantity: number;
  /** reservedQuantity / quantity, en pourcentage du stock brut. */
  reservedPercent: number;
  /** Stock reellement mobilisable : quantity − reservedQuantity. */
  freeQuantity: number;
}

/**
 * Cle de regroupement, partagee par les mouvements et par les parts reservees : les
 * deux doivent etre groupes EXACTEMENT de la meme facon, sinon les colonnes
 * "deja reserve" et "stock libre" ne correspondraient a rien de visible.
 *
 * IMPORTANT : regrouper par IDENTIFIANTS numeriques (lot.id, depot.id, location.id) et non
 * par libelles/numero de lot : deux lots distincts partageant le meme numero ne doivent
 * jamais voir leurs quantites fusionnees.
 */
function groupKey(
  group: string | undefined,
  parts: {
    articleId: number;
    lotId?: number | null;
    depotId?: number | null;
    locationId?: number | null;
  },
): string {
  if (group === 'full') {
    return `${parts.articleId}|${parts.lotId ?? ''}|${parts.depotId ?? ''}|${parts.locationId ?? ''}`;
  }
  if (group === 'lot') return `${parts.articleId}|${parts.lotId ?? ''}`;
  return `${parts.articleId}`;
}

export async function stockRows(filters: {
  group?: string;
  articleId?: number;
  depotId?: number;
  categoryId?: number;
  familyId?: number;
  search?: string;
}): Promise<StockRow[]> {
  const where: Prisma.MoveWhereInput = { status: 'ACTIF' };
  if (filters.articleId) where.articleId = filters.articleId;
  if (filters.depotId) where.depotId = filters.depotId;
  if (filters.categoryId) where.article = { categoryId: filters.categoryId };
  if (filters.familyId) where.article = { ...(where.article as object), familyId: filters.familyId };
  if (filters.search) {
    where.article = {
      ...(where.article as object),
      OR: [
        { designation: { contains: filters.search, mode: 'insensitive' } },
        { code: { contains: filters.search } },
      ],
    };
  }

  const moves = await prisma.move.findMany({
    where,
    select: {
      article: { select: { id: true, code: true, designation: true, category: { select: { label: true } }, family: { select: { label: true } }, unit: { select: { code: true } } } },
      lot: { select: { id: true, lotNumber: true, expiryDate: true } },
      depot: { select: { id: true, label: true } },
      location: { select: { id: true, label: true } },
      quantity: true,
      sens: true,
    },
  });

  // D20 : memes filtres, meme regroupement que les mouvements ci-dessus.
  const reserved = new Map<string, Prisma.Decimal>();
  const reservedParts = await activeAllocations(
    {
      ...(filters.articleId ? { articleIds: [filters.articleId] } : {}),
      ...(filters.depotId ? { depotId: filters.depotId } : {}),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.familyId ? { familyId: filters.familyId } : {}),
      ...(filters.search ? { search: filters.search } : {}),
    },
    prisma as unknown as Prisma.TransactionClient,
  );
  for (const a of reservedParts) {
    const key = groupKey(filters.group, a);
    reserved.set(key, (reserved.get(key) ?? new Prisma.Decimal(0)).add(a.remaining));
  }

  interface Acc {
    articleId: number;
    articleCode: string;
    designation: string;
    category: string | null;
    family: string | null;
    unit: string | null;
    depot?: string | null;
    location?: string | null;
    lot?: string | null;
    lotId?: number | null;
    expiryDate?: Date | null;
    quantity: number;
  }

  const map = new Map<string, Acc & { qty: Prisma.Decimal }>();
  for (const m of moves) {
    const key = groupKey(filters.group, {
      articleId: m.article.id,
      lotId: m.lot?.id,
      depotId: m.depot.id,
      locationId: m.location?.id,
    });
    const cur = map.get(key);
    const base = {
      articleId: m.article.id,
      articleCode: m.article.code,
      designation: m.article.designation,
      category: m.article.category?.label ?? null,
      family: m.article.family?.label ?? null,
      unit: m.article.unit?.code ?? null,
      lotId: filters.group === 'lot' ? m.lot?.id ?? null : undefined,
    };
    const signed = dec(m.quantity).mul(m.sens);
    if (cur) {
      cur.qty = cur.qty.add(signed);
    } else {
      map.set(key, {
        ...base,
        depot: filters.group === 'full' ? m.depot.label : undefined,
        location: filters.group === 'full' ? m.location?.label ?? undefined : undefined,
        lot: filters.group === 'lot' || filters.group === 'full' ? m.lot?.lotNumber ?? undefined : undefined,
        expiryDate: filters.group === 'lot' || filters.group === 'full' ? m.lot?.expiryDate ?? undefined : undefined,
        quantity: 0,
        qty: signed,
      });
    }
  }

  return Array.from(map.entries())
    .map(([key, r]) => {
      const qty = toNumber(r.qty);
      const reservedQuantity = toNumber(reserved.get(key) ?? new Prisma.Decimal(0));
      return {
        ...r,
        quantity: qty,
        reservedQuantity,
        // Un stock nul n'a pas de base de calcul : on affiche 0 %, jamais NaN.
        reservedPercent: qty === 0 ? 0 : Number(((reservedQuantity / qty) * 100).toFixed(1)),
        freeQuantity: Number((qty - reservedQuantity).toFixed(3)),
      };
    })
    .filter((r) => r.quantity !== 0)
    .sort((a, b) => a.articleCode.localeCompare(b.articleCode));
}

/** Stock avec seuils pour une liste d'articles. */
export async function stockWithThresholds(filter: {
  articleId?: number;
  depotId?: number;
}) {
  const rows = await stockRows({ group: 'full', ...filter });
  const byArticle = new Map<number, number>();
  for (const r of rows) {
    byArticle.set(r.articleId, (byArticle.get(r.articleId) ?? 0) + r.quantity);
  }
  const out: Array<Record<string, unknown>> = [];
  for (const [articleId, quantity] of byArticle) {
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: { id: true, code: true, designation: true, category: { select: { label: true } }, family: { select: { label: true } }, unit: { select: { code: true } } },
    });
    if (!article) continue;
    const seuils = await computeThresholds(articleId, quantity, 0, article.unit?.code ?? null);
    out.push({
      articleId,
      code: article.code,
      designation: article.designation,
      category: article.category?.label ?? null,
      family: article.family?.label ?? null,
      unit: article.unit?.code ?? null,
      stockDisponible: quantity,
      stockVirtuel: quantity,
      ...seuils,
    });
  }
  return out;
}

export async function encours(articleId: number) {
  const orders = await prisma.articleOrder.findMany({
    where: { articleId, arrived: false },
    select: { quantity: true },
  });
  return toNumber(orders.reduce<Prisma.Decimal>((a, o) => a.add(dec(o.quantity)), new Prisma.Decimal(0)));
}