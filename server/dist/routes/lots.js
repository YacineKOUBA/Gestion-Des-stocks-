"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../prisma");
const lotFlag_1 = require("../utils/lotFlag");
const parse_1 = require("../utils/parse");
const validators_1 = require("../validators");
const decimal_1 = require("../utils/decimal");
const client_1 = require("@prisma/client");
const audit_1 = require("../utils/audit");
const apiError_1 = require("../utils/apiError");
const lotStock_1 = require("../utils/lotStock");
const permissions_1 = require("../middlewares/permissions");
const router = (0, express_1.Router)();
router.get('/', (0, permissions_1.requirePermission)('lot:read'), async (req, res) => {
    const flag = req.query.flag;
    const articleId = req.query.articleId ? Number(req.query.articleId) : undefined;
    const search = req.query.search?.trim();
    // includeExhausted : les lots epuises restent normally masques, mais un RETOUR doit
    // pouvoir cibler un lot parti a zero (le lot masque, ou son stock est revenu a zero).
    const includeExhausted = req.query.includeExhausted === 'true';
    const now = new Date();
    // D24 : un drapeau inconnu est REFUSE. Avant, il etait ignore et le filtre renvoyait
    // tous les lots : un `?flag=ROUGE` lettre-morte apres le changement d'echelle aurait
    // affiché la liste complete en faisant croire qu'il avait filtre.
    const bornes = flag ? (0, lotFlag_1.expiryWhere)(flag, now) : {};
    if (flag && !bornes) {
        throw (0, apiError_1.badRequest)(`Drapeau de péremption inconnu : ${flag}. Valeurs acceptées : ${lotFlag_1.LOT_FLAGS.join(', ')}.`);
    }
    const where = {
        ...(articleId ? { articleId } : {}),
        ...(flag ? { expiryDate: { not: null, ...bornes.expiryDate } } : {}),
        ...(search
            ? {
                OR: [
                    { lotNumber: { contains: search, mode: 'insensitive' } },
                    { article: { code: { contains: search, mode: 'insensitive' } } },
                    { article: { designation: { contains: search, mode: 'insensitive' } } },
                ],
            }
            : {}),
    };
    const lots = await prisma_1.prisma.lot.findMany({
        where,
        include: {
            article: {
                select: { code: true, designation: true, currency: true, unitPrice: true, unit: { select: { code: true } } },
            },
        },
        orderBy: [{ expiryDate: 'asc' }, { id: 'desc' }],
    });
    // Quantite disponible PAR LOT : somme des mouvements actifs de CE lot uniquement
    // (independante des autres lots du meme article). Un lot epuise (solde revenu a zero
    // apres avoir ete stocke) est masque : plus rien a sortir, il n'a pas sa place dans les
    // listes ni dans les selecteurs. Il reapparait des que du stock revient.
    const stocks = await (0, lotStock_1.lotStocks)(lots.map((l) => l.id));
    const visibles = includeExhausted ? lots : lots.filter((l) => !(0, lotStock_1.isLotExhausted)(stocks.get(l.id)));
    res.json(visibles.map((l) => {
        const stock = stocks.get(l.id);
        return {
            ...l,
            quantity: (0, decimal_1.toNumber)(stock?.quantity ?? new client_1.Prisma.Decimal(0)),
            exhausted: (0, lotStock_1.isLotExhausted)(stock),
            // Historique de sortie du lot : permet de proposer en tete d'un RETOUR les lots
            // par lesquels la marchandise est reellement sortiee.
            sortiQty: (0, decimal_1.toNumber)(stock?.sortiQty ?? new client_1.Prisma.Decimal(0)),
            lastExitAt: stock?.lastExitAt ?? null,
            flag: (0, lotFlag_1.lotFlag)(l.expiryDate, now),
        };
    }));
});
// D16 : la creation et la modification d'un lot n'étaient protegees par aucune porte
// (donc ouvertes au magasinier). Elles le deviennent explicitement.
router.post('/', (0, permissions_1.requirePermission)('lot:write'), async (req, res) => {
    const data = (0, parse_1.parse)(validators_1.lotSchema, req.body);
    const lot = await prisma_1.prisma.lot.create({
        data: {
            articleId: data.articleId,
            lotNumber: data.lotNumber,
            fabricDate: data.fabricDate ?? null,
            expiryDate: data.expiryDate ?? null,
            unitPrice: data.unitPrice ?? null,
            observation: data.observation ?? null,
        },
    });
    // Le prix est propre au lot : jamais applique au prix de l'article (les autres lots
    // du meme article conservent leur propre prix). Si vide, ce lot n'a pas de prix propre
    // et les calculs retomberont sur le prix de l'article.
    await (0, audit_1.audit)(req.user.id, 'CREATION', 'lot', String(lot.id), {
        articleId: data.articleId,
        lotNumber: data.lotNumber,
        ...(data.unitPrice != null ? { unitPrice: data.unitPrice } : {}),
    });
    res.status(201).json(lot);
});
router.put('/:id', (0, permissions_1.requirePermission)('lot:write'), async (req, res) => {
    const id = Number(req.params.id);
    const data = (0, parse_1.parse)(validators_1.lotUpdateSchema, req.body);
    // Unicite (article, numero de lot) : la contrainte @@unique le garantit en base, mais on
    // verifie d'abord pour renvoyer un message clair (exclut le lot en cours de modification).
    // NB : comme le PUT est partiel, on ne controle l'unicite que si les deux champs definissant
    // la contrainte sont fournis (sinon un PUT ne modifiant que l'observation serait a tort rejete).
    if (data.articleId !== undefined && data.lotNumber !== undefined) {
        const existing = await prisma_1.prisma.lot.findFirst({
            where: { articleId: data.articleId, lotNumber: data.lotNumber },
        });
        if (existing && existing.id !== id) {
            throw (0, apiError_1.conflict)(`Un lot avec le numéro « ${data.lotNumber} » existe déjà pour cet article.`);
        }
    }
    const lot = await prisma_1.prisma.lot.update({
        where: { id },
        data: {
            ...(data.articleId !== undefined ? { articleId: data.articleId } : {}),
            ...(data.lotNumber !== undefined ? { lotNumber: data.lotNumber } : {}),
            ...(data.fabricDate !== undefined ? { fabricDate: data.fabricDate } : {}),
            ...(data.expiryDate !== undefined ? { expiryDate: data.expiryDate } : {}),
            ...(data.unitPrice !== undefined ? { unitPrice: data.unitPrice } : {}),
            ...(data.observation !== undefined ? { observation: data.observation } : {}),
        },
    });
    await (0, audit_1.audit)(req.user.id, 'MODIFICATION', 'lot', String(id), {
        ...(data.lotNumber !== undefined ? { lotNumber: data.lotNumber } : {}),
        ...(data.observation !== undefined ? { observation: data.observation } : {}),
        ...(data.unitPrice != null ? { unitPrice: data.unitPrice } : {}),
    });
    res.json(lot);
});
exports.default = router;
//# sourceMappingURL=lots.js.map