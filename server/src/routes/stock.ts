import { Router } from 'express';
import { prisma } from '../prisma';
import { stockWithThresholds, stockRows, encours, computeThresholds } from '../services/stockService';

const router = Router();

// /stock?group=article|full&depotId=&articleId=&categoryId=&familyId=&search=
router.get('/', async (req, res) => {
  const q = req.query;
  const rows = await stockRows({
    group: (q.group as string) ?? 'article',
    articleId: q.articleId ? Number(q.articleId) : undefined,
    depotId: q.depotId ? Number(q.depotId) : undefined,
    categoryId: q.categoryId ? Number(q.categoryId) : undefined,
    familyId: q.familyId ? Number(q.familyId) : undefined,
    search: q.search as string | undefined,
  });
  res.json(rows);
});

// /stock/thresholds : stock + seuils par article
router.get('/thresholds', async (req, res) => {
  const q = req.query;
  const rows = await stockWithThresholds({
    articleId: q.articleId ? Number(q.articleId) : undefined,
    depotId: q.depotId ? Number(q.depotId) : undefined,
  });
  res.json(rows);
});

// /stock/article/:id : detail d'un article (par lot/depot) + seuils + encours
router.get('/article/:id', async (req, res) => {
  const articleId = Number(req.params.id);
  const [rows, incoming] = await Promise.all([
    stockRows({ group: 'full', articleId }),
    encours(articleId),
  ]);
  const stockDisponible = rows.reduce((a, r) => a + r.quantity, 0);
  // L'unite accompagne les seuils pour que le client affiche les quantités dans la
  // bonne unité. Repli sur l'article quand l'article n'a aucune ligne de stock
  // (encours possible, stock nul).
  const unit =
    rows[0]?.unit ??
    (await prisma.article.findUnique({ where: { id: articleId }, select: { unit: { select: { code: true } } } }))?.unit?.code ??
    null;
  const t = await computeThresholds(articleId, stockDisponible, incoming, unit);
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
  res.json(await prisma.depot.findMany({ orderBy: { code: 'asc' } }));
});
router.get('/locations', async (_req, res) => {
  res.json(await prisma.location.findMany({ orderBy: { code: 'asc' } }));
});
router.get('/categories', async (_req, res) => {
  res.json(await prisma.category.findMany({ orderBy: { sort: 'asc' } }));
});

export default router;