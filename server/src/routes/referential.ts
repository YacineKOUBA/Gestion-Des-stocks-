import { Router } from 'express';
import { prisma } from '../prisma';
import { parse } from '../utils/parse';
import { referentialSchema } from '../validators/article';
import { audit } from '../utils/audit';
import { requireRole } from '../middlewares/rbac';
import { RoleCode } from '@prisma/client';
import { notFound, badRequest, conflict } from '../utils/apiError';
import { Prisma } from '@prisma/client';

const router = Router();

const REFERENCE_MODELS = [
  'family',
  'unit',
  'packaging',
  'origin',
  'depot',
  'location',
  'partner',
] as const;
type ReferenceModel = (typeof REFERENCE_MODELS)[number];

async function createRef(
  model: ReferenceModel,
  code: string,
  label: string,
  categoryId?: number | null,
) {
  switch (model) {
    case 'family': {
      // Les familles sont rattachees a la categorie "Matiere premiere" (decision utilisateur).
      let catId = categoryId ?? null;
      if (!catId) {
        const mp = await prisma.category.findUnique({ where: { code: 'MATIERE_PREMIERE' } });
        catId = mp?.id ?? null;
      }
      return prisma.family.create({ data: { code, label, categoryId: catId } });
    }
    case 'unit':
      return prisma.unit.create({ data: { code, label } });
    case 'packaging':
      return prisma.packaging.create({ data: { label } });
    case 'origin':
      return prisma.origin.create({ data: { code, label } });
    case 'depot':
      return prisma.depot.create({ data: { code, label } });
    case 'location':
      return prisma.location.create({ data: { code, label } });
    case 'partner':
      return prisma.partner.create({ data: { name: label, type: 'ENTITE' } });
  }
}

router.get('/families', async (_req, res) =>
  res.json(await prisma.family.findMany({ where: { isActive: true }, include: { category: true }, orderBy: { label: 'asc' } })));
router.get('/categories', async (_req, res) =>
  res.json(await prisma.category.findMany({ orderBy: { sort: 'asc' } })));
router.get('/units', async (_req, res) =>
  res.json(await prisma.unit.findMany({ orderBy: { code: 'asc' } })));
router.get('/packaging', async (_req, res) =>
  res.json(await prisma.packaging.findMany({ orderBy: { label: 'asc' } })));
router.get('/origins', async (_req, res) =>
  res.json(await prisma.origin.findMany({ orderBy: { label: 'asc' } })));
router.get('/depots', async (_req, res) =>
  res.json(await prisma.depot.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } })));
router.get('/locations', async (_req, res) =>
  res.json(await prisma.location.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } })));
router.get('/partners', async (_req, res) =>
  res.json(await prisma.partner.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } })));
router.get('/roles', async (_req, res) =>
  res.json(await prisma.role.findMany({ orderBy: { id: 'asc' } })));

// Creation (admin) : POST /referential/:model
router.post('/:model', requireRole(RoleCode.ADMIN), async (req, res) => {
  const model = req.params.model as ReferenceModel;
  if (!REFERENCE_MODELS.includes(model)) {
    throw notFound(`Référentiel inconnu : ${req.params.model}`);
  }
  const data = parse(referentialSchema, req.body);
  const created = await createRef(model, data.code, data.label, data.categoryId);
  await audit(req.user!.id, 'CREATION', `ref_${model}`, String((created as { id: number }).id), data);
  res.status(201).json(created);
});

async function deleteRef(model: ReferenceModel, id: number) {
  switch (model) {
    case 'family':
      return prisma.family.delete({ where: { id } });
    case 'unit':
      return prisma.unit.delete({ where: { id } });
    case 'packaging':
      return prisma.packaging.delete({ where: { id } });
    case 'origin':
      return prisma.origin.delete({ where: { id } });
    case 'depot':
      return prisma.depot.delete({ where: { id } });
    case 'location':
      return prisma.location.delete({ where: { id } });
    case 'partner':
      return prisma.partner.delete({ where: { id } });
  }
}

router.delete('/:model/:id', requireRole(RoleCode.ADMIN), async (req, res) => {
  const model = req.params.model as ReferenceModel;
  if (!REFERENCE_MODELS.includes(model)) {
    throw notFound(`Référentiel inconnu : ${req.params.model}`);
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw badRequest('Identifiant invalide');
  }
  try {
    const deleted = await deleteRef(model, id);
    await audit(req.user!.id, 'SUPPRESSION', `ref_${model}`, String(id), {
      label: (deleted as { code?: string; label?: string; name?: string }).label ?? (deleted as { name?: string }).name ?? (deleted as { code?: string }).code,
    });
    res.json({ ok: true, id });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      throw conflict('Suppression impossible : cet élément est encore utilisé par des articles, mouvements, bons ou prêts.');
    }
    throw err;
  }
});

export default router;