"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../prisma");
const movementService_1 = require("../services/movementService");
const parse_1 = require("../utils/parse");
const movement_1 = require("../validators/movement");
const permissions_1 = require("../middlewares/permissions");
const router = (0, express_1.Router)();
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
router.get('/', (0, permissions_1.requirePermission)('movement:read'), async (req, res) => {
    const q = req.query;
    const where = {};
    if (q.articleId)
        where.articleId = Number(q.articleId);
    if (q.depotId)
        where.depotId = Number(q.depotId);
    if (q.lotId)
        where.lotId = Number(q.lotId);
    if (q.type)
        where.type = { code: q.type };
    if (q.from)
        where.movementDate = { gte: new Date(String(q.from)) };
    if (q.to)
        where.movementDate = { ...where.movementDate, lte: new Date(String(q.to)) };
    // Pagination : le plafond de 500 est dur, mais le total reel est toujours renvoye
    // dans X-Total-Count pour que le client affiche "X sur N" au lieu de tronquer en silence.
    const limitRaw = Number(q.limit);
    const offsetRaw = Number(q.offset);
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) && limitRaw > 0 ? Math.trunc(limitRaw) : DEFAULT_LIMIT, 1), MAX_LIMIT);
    const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.trunc(offsetRaw) : 0;
    const [total, moves] = await prisma_1.prisma.$transaction([
        prisma_1.prisma.move.count({ where }),
        prisma_1.prisma.move.findMany({
            where,
            include: {
                type: true,
                article: { select: { code: true, designation: true, unit: { select: { code: true, label: true } } } },
                lot: true,
                depot: true,
                location: true,
                partner: { select: { name: true } },
            },
            // id en second critere : tri stable indispensable pour que la pagination ne
            // fasse pas sauter des mouvements de meme date entre deux pages.
            orderBy: [{ movementDate: 'desc' }, { id: 'desc' }],
            take: limit,
            skip: offset,
        }),
    ]);
    res.setHeader('X-Total-Count', String(total));
    res.setHeader('X-Limit', String(limit));
    res.setHeader('X-Offset', String(offset));
    res.json(moves);
});
router.post('/', (0, permissions_1.requirePermission)('movement:write'), async (req, res) => {
    const input = (0, parse_1.parse)(movement_1.movementSchema, req.body);
    const move = await (0, movementService_1.createMovement)({ ...input, movementDate: new Date(input.movementDate) }, req.user.id);
    res.status(201).json(move);
});
// Annulation / reactivation / suppression : correction apres coup, reservee a l'administrateur.
router.patch('/:id/cancel', (0, permissions_1.requirePermission)('movement:revise'), async (req, res) => {
    const id = (0, parse_1.toBigInt)(req.params.id);
    // F3 : annuler une ENTREE, ou la moitie SORTIE d'un TRANSFERT, retire du stock ;
    // l'operation est donc soumise au meme controle d'empietement que la creation et
    // que la reactivation. Le client renvoie le jeton signe si l'utilisateur a accepte
    // l'amputation des reservations.
    const data = (0, parse_1.parse)(movement_1.reactivateSchema, req.body ?? {});
    res.json(await (0, movementService_1.cancelMovement)(id, req.user.id, data.confirmToken ?? null));
});
router.patch('/:id/reactivate', (0, permissions_1.requirePermission)('movement:revise'), async (req, res) => {
    const id = (0, parse_1.toBigInt)(req.params.id);
    // D20 : reactiver un mouvement SORTIE retire a nouveau du stock, l'operation est
    // donc soumise au meme controle d'empietement que la creation. Le client renvoie
    // le jeton signe si l'utilisateur a accepte l'amputation des reservations.
    const data = (0, parse_1.parse)(movement_1.reactivateSchema, req.body ?? {});
    res.json(await (0, movementService_1.reactivateMovement)(id, req.user.id, data.confirmToken ?? null));
});
// Suppression complete d'un mouvement ANNULÉ du journal des E/S (tracée dans l'audit).
router.delete('/:id', (0, permissions_1.requirePermission)('movement:revise'), async (req, res) => {
    const id = (0, parse_1.toBigInt)(req.params.id);
    res.json(await (0, movementService_1.deleteMovement)(id, req.user.id));
});
exports.default = router;
//# sourceMappingURL=movements.js.map