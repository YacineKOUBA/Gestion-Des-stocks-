"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.kpis = kpis;
exports.lotsFlags = lotsFlags;
exports.countVisibleLots = countVisibleLots;
exports.alerts = alerts;
exports.stockByCategory = stockByCategory;
const prisma_1 = require("../prisma");
const stockService_1 = require("./stockService");
const lotFlag_1 = require("../utils/lotFlag");
const client_1 = require("@prisma/client");
const decimal_1 = require("../utils/decimal");
const lotStock_1 = require("../utils/lotStock");
/** Nombre de lots visibles : les lots epuises sont exclus, comme dans les listes. */
async function countLots() {
    const lots = await prisma_1.prisma.lot.findMany({ select: { id: true } });
    const stocks = await (0, lotStock_1.lotStocks)(lots.map((l) => l.id));
    return lots.filter((l) => !(0, lotStock_1.isLotExhausted)(stocks.get(l.id))).length;
}
async function kpis(periodDays = 30) {
    const since = new Date();
    since.setDate(since.getDate() - periodDays);
    // La periode se mesure sur la DATE D'EXPLOITATION du mouvement, pas sur sa date de saisie :
    // sinon un journal retrodatif (saisie d'historique, regularisation) compte a tort comme
    // du trafic des N derniers jours.
    const periode = { gte: since };
    const [articles, lots, moves, entries, exits, pertes, adjEntries, adjExits, alerts] = await Promise.all([
        prisma_1.prisma.article.count({ where: { statut: 'ACTIVE' } }),
        countLots(),
        prisma_1.prisma.move.count({ where: { movementDate: periode } }),
        prisma_1.prisma.move.count({
            where: { sens: 1, status: 'ACTIF', movementDate: periode },
        }),
        prisma_1.prisma.move.count({
            where: { sens: -1, status: 'ACTIF', type: { code: { not: 'PERTE' } }, movementDate: periode },
        }),
        prisma_1.prisma.move.count({
            where: { sens: -1, status: 'ACTIF', type: { code: 'PERTE' }, movementDate: periode },
        }),
        prisma_1.prisma.move.count({
            where: { sens: 1, status: 'ACTIF', type: { code: 'AJUSTEMENT' }, movementDate: periode },
        }),
        prisma_1.prisma.move.count({
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
async function lotsFlags() {
    const now = new Date();
    // D24 : quatre niveaux, du plus urgent au plus calme. Les compteurs sont construits a
    // partir de LOT_FLAGS, donc ajouter un niveau ne peut pas en oublier un.
    const bins = Object.fromEntries(lotFlag_1.LOT_FLAGS.map((f) => [f, 0]));
    const lots = await prisma_1.prisma.lot.findMany({
        where: { expiryDate: { not: null } },
        select: { id: true, lotNumber: true, expiryDate: true, article: { select: { code: true, designation: true } } },
    });
    // Un lot epuise n'a plus rien a perimer : il ne doit pas gonfler les alertes.
    const stocks = await (0, lotStock_1.lotStocks)(lots.map((l) => l.id));
    const flagged = [];
    for (const l of lots) {
        if ((0, lotStock_1.isLotExhausted)(stocks.get(l.id)))
            continue;
        const flag = (0, lotFlag_1.lotFlag)(l.expiryDate, now);
        bins[flag] += 1;
        flagged.push({ lotId: l.id, lotNumber: l.lotNumber, expiryDate: l.expiryDate, articleCode: l.article.code, designation: l.article.designation, flag });
    }
    return { counts: bins, lots: flagged };
}
/** Nombre de lots visibles : les lots epuises sont exclus, comme dans les listes. */
async function countVisibleLots() {
    const lots = await prisma_1.prisma.lot.findMany({ select: { id: true } });
    const stocks = await (0, lotStock_1.lotStocks)(lots.map((l) => l.id));
    return lots.filter((l) => !(0, lotStock_1.isLotExhausted)(stocks.get(l.id))).length;
}
async function articleAlerts() {
    const rows = await (0, stockService_1.stockWithThresholds)({});
    return rows
        .filter((r) => r.observation !== 'OK')
        .map((r) => ({ articleId: r.articleId, code: r.code, designation: r.designation, observation: r.observation }));
}
async function alerts() {
    // D17 : les prets/emprunts ne sont plus renvoyes ici. Le tableau de bord affiche
    // la carte « Prets / emprunts en cours » via /loans, qui exige loan:read ; ce
    // doublon n'etait consomme par aucun ecran et aurait fait fuiter les prets vers
    // les profils qui n'y ont pas droit (le magasinier).
    const [stock, flags] = await Promise.all([articleAlerts(), lotsFlags()]);
    // D24 : la carte d'alertes retient les deux niveaux les plus urgents, perimes et
    // peremption sous 3 mois. La fenetre d'urgence passe donc de 6 mois a 3 mois :
    // c'est la consequence directe de la nouvelle echelle, elle est voulue.
    return { stock, lots: flags.lots.filter((l) => lotFlag_1.LOT_FLAGS_ALERTE.includes(l.flag)) };
}
async function stockByCategory() {
    const rows = await (0, stockService_1.stockWithThresholds)({});
    // INVARIANT UNITE : le stock est regroupe par categorie ET par unite de mesure,
    // pour ne jamais additionner des quantites exprimees dans des unites differentes.
    const byCat = new Map();
    for (const r of rows) {
        const category = r.category ?? 'SANS CATEGORIE';
        const unit = r.unit ?? '—';
        const key = `${category}|${unit}`;
        const cur = byCat.get(key) ?? { category, unit, quantity: new client_1.Prisma.Decimal(0) };
        cur.quantity = cur.quantity.add((0, decimal_1.dec)(r.stockDisponible));
        byCat.set(key, cur);
    }
    return Array.from(byCat.values()).map((e) => ({
        category: e.category,
        unit: e.unit,
        quantity: (0, decimal_1.toNumber)(e.quantity),
    }));
}
//# sourceMappingURL=dashboardService.js.map