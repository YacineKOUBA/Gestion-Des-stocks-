"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../prisma");
const stockService_1 = require("../services/stockService");
const permissions_1 = require("../middlewares/permissions");
const router = (0, express_1.Router)();
// Etat de stock : consultation seule, ouverte a tout profil autorise (D16).
router.use((0, permissions_1.requirePermission)('stock:read'));
// /stock?group=article|full&depotId=&articleId=&categoryId=&familyId=&search=
router.get('/', async (req, res) => {
    const q = req.query;
    const rows = await (0, stockService_1.stockRows)({
        group: q.group ?? 'article',
        articleId: q.articleId ? Number(q.articleId) : undefined,
        depotId: q.depotId ? Number(q.depotId) : undefined,
        categoryId: q.categoryId ? Number(q.categoryId) : undefined,
        familyId: q.familyId ? Number(q.familyId) : undefined,
        search: q.search,
    });
    res.json(rows);
});
// /stock/thresholds : stock + seuils par article
router.get('/thresholds', async (req, res) => {
    const q = req.query;
    const rows = await (0, stockService_1.stockWithThresholds)({
        articleId: q.articleId ? Number(q.articleId) : undefined,
        depotId: q.depotId ? Number(q.depotId) : undefined,
    });
    res.json(rows);
});
// /stock/article/:id : detail d'un article (par lot/depot) + seuils + encours
router.get('/article/:id', async (req, res) => {
    const articleId = Number(req.params.id);
    const [rows, incoming] = await Promise.all([
        (0, stockService_1.stockRows)({ group: 'full', articleId }),
        (0, stockService_1.encours)(articleId),
    ]);
    const stockDisponible = rows.reduce((a, r) => a + r.quantity, 0);
    // L'unite accompagne les seuils pour que le client affiche les quantités dans la
    // bonne unité. Repli sur l'article quand l'article n'a aucune ligne de stock
    // (encours possible, stock nul).
    const unit = rows[0]?.unit ??
        (await prisma_1.prisma.article.findUnique({ where: { id: articleId }, select: { unit: { select: { code: true } } } }))?.unit?.code ??
        null;
    const t = await (0, stockService_1.computeThresholds)(articleId, stockDisponible, incoming, unit);
    res.json({
        lignes: rows,
        stockDisponible,
        encours: incoming,
        stockVirtuel: stockDisponible + incoming,
        seuils: t,
    });
});
// /stock/depots, /stock/locations, /stock/categories : pour les filtres (lecture seule)
router.get('/depots', async (_req, res) => {
    res.json(await prisma_1.prisma.depot.findMany({ orderBy: { code: 'asc' } }));
});
router.get('/locations', async (_req, res) => {
    res.json(await prisma_1.prisma.location.findMany({ orderBy: { code: 'asc' } }));
});
router.get('/categories', async (_req, res) => {
    res.json(await prisma_1.prisma.category.findMany({ orderBy: { sort: 'asc' } }));
});
exports.default = router;
//# sourceMappingURL=stock.js.map