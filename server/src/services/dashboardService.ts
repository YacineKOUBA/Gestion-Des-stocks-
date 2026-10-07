import { prisma } from '../prisma';
import { stockWithThresholds } from './stockService';
import { lotFlag, LOT_FLAGS, LOT_FLAGS_ALERTE, type LotFlagCode } from '../utils/lotFlag';
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
  // D24 : quatre niveaux, du plus urgent au plus calme. Les compteurs sont construits a
  // partir de LOT_FLAGS, donc ajouter un niveau ne peut pas en oublier un.
  const bins = Object.fromEntries(LOT_FLAGS.map((f) => [f, 0])) as Record<LotFlagCode, number>;
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
  // D17 : les prets/emprunts ne sont plus renvoyes ici. Le tableau de bord affiche
  // la carte « Prets / emprunts en cours » via /loans, qui exige loan:read ; ce
  // doublon n'etait consomme par aucun ecran et aurait fait fuiter les prets vers
  // les profils qui n'y ont pas droit (le magasinier).
  const [stock, flags] = await Promise.all([articleAlerts(), lotsFlags()]);
  // D24 : la carte d'alertes retient les deux niveaux les plus urgents, perimes et
  // peremption sous 3 mois. La fenetre d'urgence passe donc de 6 mois a 3 mois :
  // c'est la consequence directe de la nouvelle echelle, elle est voulue.
  return { stock, lots: flags.lots.filter((l) => LOT_FLAGS_ALERTE.includes(l.flag as LotFlagCode)) };
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
