import { Router } from 'express';
import { prisma } from '../prisma';
import * as inventoryService from '../services/inventoryService';
import { parse, toBigInt } from '../utils/parse';
import { inventoryOpenSchema, inventoryCountSchema, inventoryValidateSchema } from '../validators';
import { requireRole } from '../middlewares/rbac';
import { RoleCode } from '@prisma/client';

const router = Router();

router.get('/', async (_req, res) => {
  const inventories = await prisma.inventory.findMany({
    include: {
      depot: true,
      lines: { take: 0 },
      _count: { select: { lines: true } },
    },
    orderBy: { openedAt: 'desc' },
  });
  res.json(inventories);
});

router.get('/:id', async (req, res) => {
  const id = toBigInt(req.params.id);
  res.json(await inventoryService.getInventory(id));
});

router.post('/', requireRole(RoleCode.ADMIN), async (req, res) => {
  const data = parse(inventoryOpenSchema, req.body);
  res.status(201).json(await inventoryService.openInventory(data.title ?? undefined, data.depotId, req.user!.id));
});

router.post('/:id/populate', requireRole(RoleCode.ADMIN), async (req, res) => {
  const id = toBigInt(req.params.id);
  const depotId = Number(req.body.depotId);
  res.json(await inventoryService.populateLines(id, depotId));
});

router.post('/:id/lines/:lineId/count', async (req, res) => {
  const id = toBigInt(req.params.id);
  const lineId = toBigInt(req.params.lineId);
  const data = parse(inventoryCountSchema, req.body);
  res.json(await inventoryService.setCount(id, lineId, data.qtyCounted, req.user!.id));
});

router.post('/:id/lines/:lineId/validate', requireRole(RoleCode.ADMIN), async (req, res) => {
  const lineId = toBigInt(req.params.lineId);
  const data = parse(inventoryValidateSchema, req.body);
  res.json(await inventoryService.validateLine(lineId, data.decision, data.lossReason ?? undefined, req.user!.id));
});

router.post('/:id/close', requireRole(RoleCode.ADMIN), async (req, res) => {
  res.json(await inventoryService.closeInventory(toBigInt(req.params.id), req.user!.id));
});

export default router;