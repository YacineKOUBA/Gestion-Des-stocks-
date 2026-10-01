import { prisma } from '../prisma';
import { stockWithThresholds } from './stockService';
import { lotFlag, type LotFlagCode } from '../utils/lotFlag';
import { Prisma } from '@prisma/client';
import { dec, toNumber } from '../utils/decimal';
import { isLotExhausted, lotStocks } from '../utils/lotStock';

/** Nombre de lots visibles : les lots epuises sont exclus, comme dans les listes. */
async function countLots() {
  const lots = await prisma.lot.findMany({ select: { id: true } });
  const stocks = await lotStocks(lots.map((l) => l.id));
  return lots.filter((l) => !isLotExhausted(stocks.get(l.id))).length;
}

export async function kpis(periodDays = 30) {
  const since = new Date();
  since.setDate(since.getDate() - periodDays);

  // La periode se mesure sur la DATE D'EXPLOITATION du mouvement, pas sur sa date de saisie :
  // sinon un journal retrodatif (saisie d'historique, regularisation) compte a tort comme
  // du trafic des N derniers jours.
  const periode = { gte: since };
  const [articles, lots, moves, entries, exits, pertes, adjEntries, adjExits, alerts] = await Promise.all([
    prisma.article.count({ where: { statut: 'ACTIVE' } }),
    countLots(),
    prisma.move.count({ where: { movementDate: periode } }),
    prisma.move.count({
      where: { sens: 1, status: 'ACTIF', movementDate: periode },
    }),
    prisma.move.count({
      where: { sens: -1, status: 'ACTIF', type: { code: { not: 'PERTE' } }, movementDate: periode },
    }),
    prisma.move.count({
      where: { sens: -1, status: 'ACTIF', type: { code: 'PERTE' }, movementDate: periode },
    }),
    prisma.move.count({
      where: { sens: 1, status: 'ACTIF', type: { code: 'AJUSTEMENT' }, movementDate: periode },
    }),
    prisma.move.count({
      where: { sens: -1, status: 'ACTIF', type: { code: 'AJUSTEMENT' }, movementDate: periode },
    }),
    articleAlerts(),
  ]);

  return {
    nbArticles: articles,
    nbLots: lots,
    nbMouvements: moves,
    entreesPeriode: entries,
    sortiesPeriode: exits,
    pertes,
    ajustementsEntrees: adjEntries,
    ajustementsSorties: adjExits,
    alertes: alerts.length,
  };
}

export async function lotsFlags() {
  const now = new Date();
  const bins = { ROUGE: 0, ORANGE: 0, VERT: 0, PERIME: 0 };
  const lots = await prisma.lot.findMany({
    where: { expiryDate: { not: null } },
    select: { id: true, lotNumber: true, expiryDate: true, article: { select: { code: true, designation: true } } },
  });
  // Un lot epuise n'a plus rien a perimer : il ne doit pas gonfler les alertes.
  const stocks = await lotStocks(lots.map((l) => l.id));
  const flagged: Array<Record<string, unknown>> = [];
  for (const l of lots) {
    if (isLotExhausted(stocks.get(l.id))) continue;
    const flag = lotFlag(l.expiryDate, now) as LotFlagCode;
    bins[flag] += 1;
    flagged.push({ lotId: l.id, lotNumber: l.lotNumber, expiryDate: l.expiryDate, articleCode: l.article.code, designation: l.article.designation, flag });
  }
  return { counts: bins, lots: flagged };
}

/** Nombre de lots visibles : les lots epuises sont exclus, comme dans les listes. */
export async function countVisibleLots() {
  const lots = await prisma.lot.findMany({ select: { id: true } });
  const stocks = await lotStocks(lots.map((l) => l.id));
  return lots.filter((l) => !isLotExhausted(stocks.get(l.id))).length;
}

async function articleAlerts() {
  const rows = await stockWithThresholds({});
  return rows
    .filter((r) => r.observation !== 'OK')
    .map((r) => ({ articleId: r.articleId, code: r.code, designation: r.designation, observation: r.observation }));
}

export async function alerts() {
  const [stock, flags, loans] = await Promise.all([
    articleAlerts(),
    lotsFlags(),
    prisma.loan.findMany({
      where: { status: 'OUVERT' },
      select: { id: true, partner: { select: { name: true } }, quantity: true },
    }),
  ]);
  return { stock, lots: flags.lots.filter((l) => l.flag === 'ROUGE' || l.flag === 'PERIME'), prets: loans };
}

export async function stockByCategory() {
  const rows = await stockWithThresholds({});
  // INVARIANT UNITE : le stock est regroupe par categorie ET par unite de mesure,
  // pour ne jamais additionner des quantites exprimees dans des unites differentes.
  const byCat = new Map<string, { category: string; unit: string; quantity: Prisma.Decimal }>();
  for (const r of rows) {
    const category = (r.category as string) ?? 'SANS CATEGORIE';
    const unit = (r.unit as string | null) ?? '—';
    const key = `${category}|${unit}`;
    const cur = byCat.get(key) ?? { category, unit, quantity: new Prisma.Decimal(0) };
    cur.quantity = cur.quantity.add(dec(r.stockDisponible as number));
    byCat.set(key, cur);
  }
  return Array.from(byCat.values()).map((e) => ({
    category: e.category,
    unit: e.unit,
    quantity: toNumber(e.quantity),
  }));
}
