import { prisma } from '../prisma';
import { monthlyConsumption } from './articleService';
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
  quantity: number;
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
    // cle : article (par defaut), article+lot (group 'lot'), ou article+lot+depot+emplacement
    // (group 'full').
    // IMPORTANT : regrouper par IDENTIFIANTS numeriques (lot.id, depot.id, location.id) et non
    // par libelles/numero de lot : deux lots distincts partageant le meme numero ne doivent
    // jamais voir leurs quantites fusionnees.
    let key: string;
    if (filters.group === 'full') {
      key = `${m.article.id}|${m.lot?.id ?? ''}|${m.depot.id}|${m.location?.id ?? ''}`;
    } else if (filters.group === 'lot') {
      key = `${m.article.id}|${m.lot?.id ?? ''}`;
    } else {
      key = `${m.article.id}`;
    }
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

  return Array.from(map.values())
    .map((r) => ({ ...r, quantity: toNumber(r.qty) }))
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