import { Router } from 'express';
import { prisma } from '../prisma';
import { requireRole } from '../middlewares/rbac';
import { RoleCode } from '@prisma/client';

const router = Router();
router.use(requireRole(RoleCode.ADMIN));

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
// Garde-fou memoire sur la recherche dans le JSON "details" (ILIKE = scan complet).
// Au-dela, on tronque et on le signale au client via X-Search-Truncated.
const SEARCH_MATCH_CAP = 5000;

router.get('/', async (req, res) => {
  const q = req.query;
  const where: Record<string, unknown> = {};
  if (q.userId) where.userId = Number(q.userId);
  let searchTruncated = false;
  // Recherche libre : entite (sous-chaine insensible a la casse), reference, utilisateur, ou dans les details (json).
  if (q.search) {
    const s = String(q.search);
    let jsonIds: { id: bigint }[] = [];
    if (s.length >= 2) {
      jsonIds = await prisma.$queryRaw`SELECT id FROM audit_log WHERE CAST(changes AS text) ILIKE ${`%${s}%`} LIMIT ${SEARCH_MATCH_CAP + 1}`;
      if (jsonIds.length > SEARCH_MATCH_CAP) {
        jsonIds = jsonIds.slice(0, SEARCH_MATCH_CAP);
        searchTruncated = true;
      }
    }
    where.OR = [
      { entity: { contains: s, mode: 'insensitive' as const } },
      { entityId: { contains: s } },
      { user: { login: { contains: s, mode: 'insensitive' as const } } },
      ...(jsonIds.length ? [{ id: { in: jsonIds.map((r) => r.id) } }] : []),
    ];
  } else {
    if (q.entity) where.entity = String(q.entity);
  }
  if (q.action) where.action = String(q.action);

  // Pagination : le plafond de 500 reste dur, mais le total reel est renvoye dans
  // X-Total-Count pour que le client affiche "X sur N" au lieu de tronquer en silence.
  const limitRaw = Number(q.limit);
  const offsetRaw = Number(q.offset);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) && limitRaw > 0 ? Math.trunc(limitRaw) : DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.trunc(offsetRaw) : 0;

  const [total, logs] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { login: true } } },
      // id en second critere : tri stable, sinon des entrees de meme date
      // pourraient sauter d'une page a l'autre.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      skip: offset,
    }),
  ]);

  res.setHeader('X-Total-Count', String(total));
  res.setHeader('X-Limit', String(limit));
  res.setHeader('X-Offset', String(offset));
  if (searchTruncated) res.setHeader('X-Search-Truncated', 'true');
  res.json(logs);
});

export default router;