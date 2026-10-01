import { Router } from 'express';
import * as articleService from '../services/articleService';
import { parse } from '../utils/parse';
import { articleSchema, articleUpdateSchema, priceSchema } from '../validators/article';
import { requireRole } from '../middlewares/rbac';
import { RoleCode } from '@prisma/client';

const router = Router();

router.get('/', async (req, res) => {
  const q = req.query;
  const articles = await articleService.listArticles({
    search: q.search as string | undefined,
    categoryId: q.categoryId ? Number(q.categoryId) : undefined,
    familyId: q.familyId ? Number(q.familyId) : undefined,
    statut: q.statut as string | undefined,
  });
  res.json(articles);
});

router.get('/:id', async (req, res) => {
  res.json(await articleService.getArticle(Number(req.params.id)));
});

router.get('/:id/consumption', async (req, res) => {
  res.json(await articleService.monthlyConsumption(Number(req.params.id)));
});

router.post('/', requireRole(RoleCode.ADMIN), async (req, res) => {
  const data = parse(articleSchema, req.body);
  const article = await articleService.createArticle(
    {
      designation: data.designation,
      designation2: data.designation2,
      fabricant: data.fabricant,
      emploiGd: data.emploiGd,
      application: data.application,
      sourceAchat: data.sourceAchat,
      periode: data.periode,
      frequence: data.frequence,
      statut: data.statut,
      unitPrice: data.unitPrice,
      currency: data.currency ?? 'DZD',
      isLotTracked: data.isLotTracked,
      category: { connect: { id: data.categoryId } },
      unit: { connect: { id: data.unitId } },
      ...(data.familyId ? { family: { connect: { id: data.familyId } } } : {}),
      ...(data.packagingId ? { packaging: { connect: { id: data.packagingId } } } : {}),
      ...(data.originId ? { origin: { connect: { id: data.originId } } } : {}),
    },
    req.user!.id,
  );
  res.status(201).json(article);
});

router.put('/:id', requireRole(RoleCode.ADMIN), async (req, res) => {
  const id = Number(req.params.id);
  const data = parse(articleUpdateSchema, req.body);
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const input: any = {};
  if (data.designation !== undefined) input.designation = data.designation;
  if (data.designation2 !== undefined) input.designation2 = data.designation2;
  if (data.fabricant !== undefined) input.fabricant = data.fabricant;
  if (data.emploiGd !== undefined) input.emploiGd = data.emploiGd;
  if (data.application !== undefined) input.application = data.application;
  if (data.sourceAchat !== undefined) input.sourceAchat = data.sourceAchat;
  if (data.periode !== undefined) input.periode = data.periode;
  if (data.frequence !== undefined) input.frequence = data.frequence;
  if (data.statut !== undefined) input.statut = data.statut;
  if (data.unitPrice !== undefined) input.unitPrice = data.unitPrice;
  if (data.currency !== undefined) input.currency = data.currency;
  if (data.isLotTracked !== undefined) input.isLotTracked = data.isLotTracked;
  if (data.categoryId !== undefined) input.category = { connect: { id: data.categoryId } };
  if (data.unitId !== undefined) input.unit = { connect: { id: data.unitId } };
  if (data.familyId !== undefined) input.family = data.familyId ? { connect: { id: data.familyId } } : { disconnect: true };
  if (data.packagingId !== undefined) input.packaging = data.packagingId ? { connect: { id: data.packagingId } } : { disconnect: true };
  if (data.originId !== undefined) input.origin = data.originId ? { connect: { id: data.originId } } : { disconnect: true };
  res.json(await articleService.updateArticle(id, input, req.user!.id));
});

router.put('/:id/price', requireRole(RoleCode.ADMIN), async (req, res) => {
  const { unitPrice, currency } = parse(priceSchema, req.body);
  res.json(await articleService.setArticlePrice(Number(req.params.id), unitPrice, currency, req.user!.id));
});

// Suppression totale d'un article (autorisée uniquement s'il ne figure dans aucun dépôt).
router.delete('/:id', requireRole(RoleCode.ADMIN), async (req, res) => {
  res.json(await articleService.deleteArticle(Number(req.params.id), req.user!.id));
});

export default router;