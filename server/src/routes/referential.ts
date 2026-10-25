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

/** Types d'acteur acceptes. Source unique, partagee par la lecture et la creation. */
const PARTNER_TYPES = ['FOURNISSEUR', 'CLIENT', 'ENTITE', 'AUTRE'] as const;
type PartnerTypeValue = (typeof PARTNER_TYPES)[number];

async function createRef(
  model: ReferenceModel,
  code: string,
  label: string,
  categoryId?: number | null,
  partnerType?: PartnerTypeValue,
) {
  switch (model) {
    case 'family': {
      // D32 : detection de doublons pour assurer la coherence
      if (code && code !== '-') {
        const existing = await prisma.family.findFirst({ where: { code: { equals: code, mode: 'insensitive' } } });
        if (existing) throw conflict(`Une famille avec le code « ${code} » existe déjà.`);
      }
      const existingByLabel = await prisma.family.findFirst({ where: { label: { equals: label, mode: 'insensitive' } } });
      if (existingByLabel) throw conflict(`Une famille avec le libellé « ${label} » existe déjà.`);
      // Les familles sont rattachees a la categorie "Matiere premiere" (decision utilisateur).
      let catId = categoryId ?? null;
      if (!catId) {
        const mp = await prisma.category.findUnique({ where: { code: 'MATIERE_PREMIERE' } });
        catId = mp?.id ?? null;
      }
      return prisma.family.create({ data: { code, label, categoryId: catId } });
    }
    case 'unit': {
      if (code && code !== '-') {
        const existing = await prisma.unit.findFirst({ where: { code: { equals: code, mode: 'insensitive' } } });
        if (existing) throw conflict(`Une unité avec le code « ${code} » existe déjà.`);
      }
      const existingByLabel = await prisma.unit.findFirst({ where: { label: { equals: label, mode: 'insensitive' } } });
      if (existingByLabel) throw conflict(`Une unité avec le libellé « ${label} » existe déjà.`);
      return prisma.unit.create({ data: { code, label } });
    }
    case 'packaging': {
      if (code && code !== '-') {
        const existing = await prisma.packaging.findFirst({ where: { code: { equals: code, mode: 'insensitive' } } });
        if (existing) throw conflict(`Un conditionnement avec le code « ${code} » existe déjà.`);
      }
      const existingByLabel = await prisma.packaging.findFirst({ where: { label: { equals: label, mode: 'insensitive' } } });
      if (existingByLabel) throw conflict(`Un conditionnement avec le libellé « ${label} » existe déjà.`);
      return prisma.packaging.create({ data: { code, label } });
    }
    case 'origin': {
      if (code && code !== '-') {
        const existing = await prisma.origin.findFirst({ where: { code: { equals: code, mode: 'insensitive' } } });
        if (existing) throw conflict(`Une origine avec le code « ${code} » existe déjà.`);
      }
      const existingByLabel = await prisma.origin.findFirst({ where: { label: { equals: label, mode: 'insensitive' } } });
      if (existingByLabel) throw conflict(`Une origine avec le libellé « ${label} » existe déjà.`);
      return prisma.origin.create({ data: { code, label } });
    }
    case 'depot': {
      if (code && code !== '-') {
        const existing = await prisma.depot.findFirst({ where: { code: { equals: code, mode: 'insensitive' } } });
        if (existing) throw conflict(`Un dépôt avec le code « ${code} » existe déjà.`);
      }
      const existingByLabel = await prisma.depot.findFirst({ where: { label: { equals: label, mode: 'insensitive' } } });
      if (existingByLabel) throw conflict(`Un dépôt avec le libellé « ${label} » existe déjà.`);
      return prisma.depot.create({ data: { code, label } });
    }
    case 'location': {
      if (code && code !== '-') {
        const existing = await prisma.location.findFirst({ where: { code: { equals: code, mode: 'insensitive' } } });
        if (existing) throw conflict(`Un emplacement avec le code « ${code} » existe déjà.`);
      }
      const existingByLabel = await prisma.location.findFirst({ where: { label: { equals: label, mode: 'insensitive' } } });
      if (existingByLabel) throw conflict(`Un emplacement avec le libellé « ${label} » existe déjà.`);
      return prisma.location.create({ data: { code, label } });
    }
    case 'partner': {
      // D32 : detection de doublons pour les acteurs (par nom et type)
      const pType = partnerType ?? 'ENTITE';
      const existingByName = await prisma.partner.findFirst({ 
        where: { 
          name: { equals: label, mode: 'insensitive' },
          type: pType,
          isActive: true 
        } 
      });
      if (existingByName) throw conflict(`Un ${pType === 'CLIENT' ? 'client' : pType === 'FOURNISSEUR' ? 'fournisseur' : 'acteur'} avec ce nom existe déjà.`);
      // `partnerType` vient de l'appelant (corps ou requete). Un type absent ou inconnu
      // retombe sur ENTITE, comportement historique conserve.
      return prisma.partner.create({ data: { name: label, type: partnerType ?? 'ENTITE' } });
    }
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
router.get('/partners', async (req, res) => {
  const type = req.query.type as string | undefined;
  const where: any = { isActive: true };
  if (type && PARTNER_TYPES.includes(type as PartnerTypeValue)) {
    where.type = type;
  }
  res.json(await prisma.partner.findMany({ where, orderBy: { name: 'asc' } }));
});
router.get('/roles', async (_req, res) =>
  res.json(await prisma.role.findMany({ orderBy: { id: 'asc' } })));

// Creation (admin) : POST /referential/:model
router.post('/:model', requirePermission('referential:write'), async (req, res) => {
  const model = req.params.model as ReferenceModel;
  if (!REFERENCE_MODELS.includes(model)) {
    throw notFound(`Référentiel inconnu : ${req.params.model}`);
  }
  const data = parse(referentialSchema, req.body);
  // Le type d'acteur (CLIENT / FOURNISSEUR / ...) vient du corps, avec repli sur la
  // requete pour rester compatible avec un appel `?type=`. Il n'est lu que pour le
  // modele `partner` ; les autres referentiels l'ignorent.
  const rawType = data.type ?? (req.query.type as string | undefined);
  const partnerType = PARTNER_TYPES.includes(rawType as PartnerTypeValue)
    ? (rawType as PartnerTypeValue)
    : undefined;
  const created = await createRef(model, data.code, data.label, data.categoryId, partnerType);
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