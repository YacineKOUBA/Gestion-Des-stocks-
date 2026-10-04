import { Router } from 'express';
import { prisma } from '../prisma';
import { parse } from '../utils/parse';
import { referentialSchema } from '../validators/article';
import { plafondExemptSchema } from '../validators';
import { audit } from '../utils/audit';
import { requirePermission } from '../middlewares/permissions';
import { notFound, badRequest, conflict } from '../utils/apiError';
import { Prisma } from '@prisma/client';

const router = Router();

// D16 : les lectures etant ouvertes a tous les profils, seul l'ecran Referentiel est
// protege (menu `admin` avant D16). Aucune ecriture n'etait accessible au magasinier.
router.use(requirePermission('referential:read'));

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
router.post('/:model', requirePermission('referential:write'), async (req, res) => {
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

/**
 * D21 : dispense du plafond cumulatif de reservation.
 *
 * Cette route est volontairement la SEULE voie d'ecriture d'un acteur existant, et
 * elle n'accepte QU'un seul champ. Le referentiel ne dispose pas d'ecran
 * d'edition (le formulaire ne fait que creer) : ajouter une mise a jour generale
 * aurait ouvert la modification du nom, du type et du statut actif a un profil qui
 * n'en a pas la charge, et n'aurait rien ajoute au besoin reels.
 *
 * Le droit est `referential:write`, deja reserve a l'administrateur : la decision
 * « valide par la direction generale, appliquee par l'administrateur » ne demande
 * donc aucun droit nouveau.
 */
router.patch(
  '/partners/:id/plafond-exempt',
  requirePermission('referential:write'),
  async (req, res) => {
    const data = parse(plafondExemptSchema, req.body);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw badRequest('Identifiant invalide');
    }
    const before = await prisma.partner.findUnique({
      where: { id },
      select: { id: true, name: true, plafondExempt: true },
    });
    if (!before) throw notFound('Acteur introuvable');

    const updated = await prisma.partner.update({
      where: { id },
      data: { plafondExempt: data.plafondExempt },
      select: { id: true, name: true, plafondExempt: true },
    });
    // L'avant/apres est trace : cette dispense est une derogation a une regle de
    // gestion, c'est donc la kind d'information qu'on doit pouvoir relire six mois
    // plus tard dans le journal.
    await audit(req.user!.id, 'MODIFICATION', 'ref_partner', String(id), {
      champ: 'plafondExempt',
      avant: before.plafondExempt,
      apres: updated.plafondExempt,
      acteur: updated.name,
    });
    res.json(updated);
  },
);

router.delete('/:model/:id', requirePermission('referential:write'), async (req, res) => {
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