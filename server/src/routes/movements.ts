import { Router } from 'express';
import { prisma } from '../prisma';
import { createMovement, cancelMovement, reactivateMovement, deleteMovement } from '../services/movementService';
import { parse, toBigInt } from '../utils/parse';
import { movementSchema } from '../validators/movement';
import { requirePermission } from '../middlewares/permissions';

const router = Router();

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

router.get('/', requirePermission('movement:read'), async (req, res) => {
  const q = req.query;
  const where: Record<string, unknown> = {};
  if (q.articleId) where.articleId = Number(q.articleId);
  if (q.depotId) where.depotId = Number(q.depotId);
  if (q.lotId) where.lotId = Number(q.lotId);
  if (q.type) where.type = { code: q.type };
  if (q.from) where.movementDate = { gte: new Date(String(q.from)) };
  if (q.to) where.movementDate = { ...(where.movementDate as object), lte: new Date(String(q.to)) };

  // Pagination : le plafond de 500 est dur, mais le total reel est toujours renvoye
  // dans X-Total-Count pour que le client affiche "X sur N" au lieu de tronquer en silence.
  const limitRaw = Number(q.limit);
  const offsetRaw = Number(q.offset);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) && limitRaw > 0 ? Math.trunc(limitRaw) : DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.trunc(offsetRaw) : 0;

  const [total, moves] = await prisma.$transaction([
    prisma.move.count({ where }),
    prisma.move.findMany({
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

router.post('/', requirePermission('movement:write'), async (req, res) => {
  const input = parse(movementSchema, req.body);
  const move = await createMovement({ ...input, movementDate: new Date(input.movementDate) }, req.user!.id);
  res.status(201).json(move);
});

// Annulation / reactivation / suppression : correction apres coup, reservee a l'administrateur.
router.patch('/:id/cancel', requirePermission('movement:revise'), async (req, res) => {
  const id = toBigInt(req.params.id);
  res.json(await cancelMovement(id, req.user!.id));
});

router.patch('/:id/reactivate', requirePermission('movement:revise'), async (req, res) => {
  const id = toBigInt(req.params.id);
  res.json(await reactivateMovement(id, req.user!.id));
});

// Suppression complete d'un mouvement ANNULÉ du journal des E/S (tracée dans l'audit).
router.delete('/:id', requirePermission('movement:revise'), async (req, res) => {
  const id = toBigInt(req.params.id);
  res.json(await deleteMovement(id, req.user!.id));
});

export default router;