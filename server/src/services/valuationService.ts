import { prisma } from '../prisma';
import { stockRows } from './stockService';
import { Prisma } from '@prisma/client';
import { dec, toNumber } from '../utils/decimal';
import { lotFlag, type LotFlagCode } from '../utils/lotFlag';

export async function valuation(filters: {
  categoryId?: number;
  familyId?: number;
  depotId?: number;
}) {
  // Stock regroupé PAR LOT : chaque lot est valorise a SON prix unitaire, saisi a sa creation
  // et suivi pendant toute sa duree de vie. Le prix de l'article n'est utilise que comme
  // repli, pour les lots qui n'ont pas de prix propre.
  const rows = await stockRows({ group: 'lot', ...filters });

  const ids = [...new Set(rows.map((r) => r.articleId))];
  const lotIds = [...new Set(rows.map((r) => r.lotId).filter((x): x is number => x != null))];

  const [articles, lots] = await Promise.all([
    ids.length
      ? prisma.article.findMany({
          where: { id: { in: ids } },
          select: { id: true, unitPrice: true, currency: true },
        })
      : Promise.resolve([]),
    lotIds.length
      ? prisma.lot.findMany({
          where: { id: { in: lotIds } },
          select: { id: true, unitPrice: true },
        })
      : Promise.resolve([]),
  ]);

  const priceById = new Map(articles.map((a) => [a.id, dec(a.unitPrice)]));
  const currencyById = new Map(articles.map((a) => [a.id, a.currency]));
  const lotPriceById = new Map(
    lots.filter((l) => l.unitPrice != null).map((l) => [l.id, dec(l.unitPrice!)]) as [number, Prisma.Decimal][],
  );

  interface LotDetail {
    lotId: number | null;
    lotNumber: string | null;
    expiryDate: Date | null;
    flag: LotFlagCode | null;
    quantity: number;
    unitPrice: number;
    /** LOT : prix propre au lot. ARTICLE : repli sur le prix de l'article (lot sans prix). */
    priceSource: 'LOT' | 'ARTICLE';
    value: number;
  }

  interface Acc {
    articleId: number;
    code: string;
    designation: string;
    category: string | null;
    family: string | null;
    unit: string | null;
    currency: string;
    quantity: Prisma.Decimal;
    value: Prisma.Decimal;
    lots: LotDetail[];
  }
  const acc = new Map<number, Acc>();

  for (const r of rows) {
    // Prix propre au lot s'il en a un, sinon prix de l'article (le prix de l'article ne sert
    // QUE de repli : des qu'un lot a son propre prix, c'est ce dernier qui le remplace).
    const lotPrice = r.lotId != null ? lotPriceById.get(r.lotId) : undefined;
    const price = lotPrice ?? priceById.get(r.articleId) ?? new Prisma.Decimal(0);
    const qty = dec(r.quantity);
    const currency = currencyById.get(r.articleId) ?? 'DZD';
    const value = qty.mul(price);

    // Detail du calcul : une ligne par lot, avec le prix qui lui est effectivement applique.
    const detail: LotDetail = {
      lotId: r.lotId ?? null,
      lotNumber: r.lot ?? null,
      expiryDate: r.expiryDate ?? null,
      flag: lotFlag(r.expiryDate),
      quantity: toNumber(qty),
      unitPrice: toNumber(price, 4),
      priceSource: lotPrice ? 'LOT' : 'ARTICLE',
      value: toNumber(value, 4),
    };

    const cur = acc.get(r.articleId);
    if (cur) {
      cur.quantity = cur.quantity.add(qty);
      cur.value = cur.value.add(value);
      cur.lots.push(detail);
    } else {
      acc.set(r.articleId, {
        articleId: r.articleId,
        code: r.articleCode,
        designation: r.designation,
        category: r.category,
        family: r.family,
        unit: r.unit,
        currency,
        quantity: qty,
        value,
        lots: [detail],
      });
    }
  }

  const totals: Record<string, Prisma.Decimal> = {};
  const result = Array.from(acc.values())
    .map((a) => {
      const qty = toNumber(a.quantity);
      const valueNum = toNumber(a.value, 4);
      totals[a.currency] = (totals[a.currency] ?? new Prisma.Decimal(0)).add(dec(a.value));
      return {
        articleId: a.articleId,
        articleCode: a.code,
        designation: a.designation,
        category: a.category,
        family: a.family,
        unit: a.unit,
        quantity: qty,
        // Prix moyen pondere du stock : somme(pu du lot x qte du lot) / qte totale de l'article.
        // Les lots peuvent avoir des prix differents ; le prix de l'article n'intervient que
        // pour les lots qui n'ont pas de prix propre.
        unitPrice: qty !== 0 ? toNumber(a.value.div(a.quantity), 4) : 0,
        currency: a.currency,
        value: valueNum,
        // Lots ordonnes par peremption (FEFO) : les plus proches de la date limite en tete.
        lots: [...a.lots].sort((x, y) => {
          const ex = x.expiryDate ? new Date(x.expiryDate).getTime() : Number.POSITIVE_INFINITY;
          const ey = y.expiryDate ? new Date(y.expiryDate).getTime() : Number.POSITIVE_INFINITY;
          if (ex !== ey) return ex - ey;
          return (x.lotNumber ?? '').localeCompare(y.lotNumber ?? '');
        }),
      };
    })
    .sort((x, y) => x.articleCode.localeCompare(y.articleCode));

  return {
    rows: result,
    totals: Object.fromEntries(Object.entries(totals).map(([c, v]) => [c, toNumber(v, 4)])),
  };
}