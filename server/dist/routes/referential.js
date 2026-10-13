"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../prisma");
const parse_1 = require("../utils/parse");
const article_1 = require("../validators/article");
const validators_1 = require("../validators");
const audit_1 = require("../utils/audit");
const permissions_1 = require("../middlewares/permissions");
const apiError_1 = require("../utils/apiError");
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
// D16 : les lectures etant ouvertes a tous les profils, seul l'ecran Referentiel est
// protege (menu `admin` avant D16). Aucune ecriture n'etait accessible au magasinier.
router.use((0, permissions_1.requirePermission)('referential:read'));
const REFERENCE_MODELS = [
    'family',
    'unit',
    'packaging',
    'origin',
    'depot',
    'location',
    'partner',
];
async function createRef(model, code, label, categoryId) {
    switch (model) {
        case 'family': {
            // Les familles sont rattachees a la categorie "Matiere premiere" (decision utilisateur).
            let catId = categoryId ?? null;
            if (!catId) {
                const mp = await prisma_1.prisma.category.findUnique({ where: { code: 'MATIERE_PREMIERE' } });
                catId = mp?.id ?? null;
            }
            return prisma_1.prisma.family.create({ data: { code, label, categoryId: catId } });
        }
        case 'unit':
            return prisma_1.prisma.unit.create({ data: { code, label } });
        case 'packaging':
            return prisma_1.prisma.packaging.create({ data: { code, label } });
        case 'origin':
            return prisma_1.prisma.origin.create({ data: { code, label } });
        case 'depot':
            return prisma_1.prisma.depot.create({ data: { code, label } });
        case 'location':
            return prisma_1.prisma.location.create({ data: { code, label } });
        case 'partner':
            return prisma_1.prisma.partner.create({ data: { name: label, type: 'ENTITE' } });
    }
}
router.get('/families', async (_req, res) => res.json(await prisma_1.prisma.family.findMany({ where: { isActive: true }, include: { category: true }, orderBy: { label: 'asc' } })));
router.get('/categories', async (_req, res) => res.json(await prisma_1.prisma.category.findMany({ orderBy: { sort: 'asc' } })));
router.get('/units', async (_req, res) => res.json(await prisma_1.prisma.unit.findMany({ orderBy: { code: 'asc' } })));
router.get('/packaging', async (_req, res) => res.json(await prisma_1.prisma.packaging.findMany({ orderBy: { label: 'asc' } })));
router.get('/origins', async (_req, res) => res.json(await prisma_1.prisma.origin.findMany({ orderBy: { label: 'asc' } })));
router.get('/depots', async (_req, res) => res.json(await prisma_1.prisma.depot.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } })));
router.get('/locations', async (_req, res) => res.json(await prisma_1.prisma.location.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } })));
router.get('/partners', async (_req, res) => res.json(await prisma_1.prisma.partner.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } })));
router.get('/roles', async (_req, res) => res.json(await prisma_1.prisma.role.findMany({ orderBy: { id: 'asc' } })));
// Creation (admin) : POST /referential/:model
router.post('/:model', (0, permissions_1.requirePermission)('referential:write'), async (req, res) => {
    const model = req.params.model;
    if (!REFERENCE_MODELS.includes(model)) {
        throw (0, apiError_1.notFound)(`Référentiel inconnu : ${req.params.model}`);
    }
    const data = (0, parse_1.parse)(article_1.referentialSchema, req.body);
    const created = await createRef(model, data.code, data.label, data.categoryId);
    await (0, audit_1.audit)(req.user.id, 'CREATION', `ref_${model}`, String(created.id), data);
    res.status(201).json(created);
});
async function deleteRef(model, id) {
    switch (model) {
        case 'family':
            return prisma_1.prisma.family.delete({ where: { id } });
        case 'unit':
            return prisma_1.prisma.unit.delete({ where: { id } });
        case 'packaging':
            return prisma_1.prisma.packaging.delete({ where: { id } });
        case 'origin':
            return prisma_1.prisma.origin.delete({ where: { id } });
        case 'depot':
            return prisma_1.prisma.depot.delete({ where: { id } });
        case 'location':
            return prisma_1.prisma.location.delete({ where: { id } });
        case 'partner':
            return prisma_1.prisma.partner.delete({ where: { id } });
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
router.patch('/partners/:id/plafond-exempt', (0, permissions_1.requirePermission)('referential:write'), async (req, res) => {
    const data = (0, parse_1.parse)(validators_1.plafondExemptSchema, req.body);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        throw (0, apiError_1.badRequest)('Identifiant invalide');
    }
    const before = await prisma_1.prisma.partner.findUnique({
        where: { id },
        select: { id: true, name: true, plafondExempt: true },
    });
    if (!before)
        throw (0, apiError_1.notFound)('Acteur introuvable');
    const updated = await prisma_1.prisma.partner.update({
        where: { id },
        data: { plafondExempt: data.plafondExempt },
        select: { id: true, name: true, plafondExempt: true },
    });
    // L'avant/apres est trace : cette dispense est une derogation a une regle de
    // gestion, c'est donc la kind d'information qu'on doit pouvoir relire six mois
    // plus tard dans le journal.
    await (0, audit_1.audit)(req.user.id, 'MODIFICATION', 'ref_partner', String(id), {
        champ: 'plafondExempt',
        avant: before.plafondExempt,
        apres: updated.plafondExempt,
        acteur: updated.name,
    });
    res.json(updated);
});
router.delete('/:model/:id', (0, permissions_1.requirePermission)('referential:write'), async (req, res) => {
    const model = req.params.model;
    if (!REFERENCE_MODELS.includes(model)) {
        throw (0, apiError_1.notFound)(`Référentiel inconnu : ${req.params.model}`);
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        throw (0, apiError_1.badRequest)('Identifiant invalide');
    }
    try {
        const deleted = await deleteRef(model, id);
        await (0, audit_1.audit)(req.user.id, 'SUPPRESSION', `ref_${model}`, String(id), {
            label: deleted.label ?? deleted.name ?? deleted.code,
        });
        res.json({ ok: true, id });
    }
    catch (err) {
        if (err instanceof client_1.Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
            throw (0, apiError_1.conflict)('Suppression impossible : cet élément est encore utilisé par des articles, mouvements, bons ou prêts.');
        }
        throw err;
    }
});
exports.default = router;
//# sourceMappingURL=referential.js.map