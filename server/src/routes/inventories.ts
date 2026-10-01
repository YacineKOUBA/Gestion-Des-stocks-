import { Router } from 'express';
import { prisma } from '../prisma';
import * as inventoryService from '../services/inventoryService';
import { parse, toBigInt } from '../utils/parse';
import { inventoryOpenSchema, inventoryCountSchema, inventoryValidateSchema } from '../validators';
import { requirePermission } from '../middlewares/permissions';

const router = Router();

router.get('/', requirePermission('inventory:read'), async (_req, res) => {
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

router.get('/:id', requirePermission('inventory:read'), async (req, res) => {
  const id = toBigInt(req.params.id);
  res.json(await inventoryService.getInventory(id));
});

router.post('/', requirePermission('inventory:write'), async (req, res) => {
  const data = parse(inventoryOpenSchema, req.body);
  res.status(201).json(await inventoryService.openInventory(data.title ?? undefined, data.depotId, req.user!.id));
});

router.post('/:id/populate', requirePermission('inventory:write'), async (req, res) => {
  const id = toBigInt(req.params.id);
  const depotId = Number(req.body.depotId);
  res.json(await inventoryService.populateLines(id, depotId));
});

// Saisie des quantites comptees : ouvert au magasinier, qui fait le comptage physique.
router.post('/:id/lines/:lineId/count', requirePermission('inventory:count'), async (req, res) => {
  const id = toBigInt(req.params.id);
  const lineId = toBigInt(req.params.lineId);
  const data = parse(inventoryCountSchema, req.body);
  res.json(await inventoryService.setCount(id, lineId, data.qtyCounted, req.user!.id));
});

router.post('/:id/lines/:lineId/validate', requirePermission('inventory:decide'), async (req, res) => {
  const lineId = toBigInt(req.params.lineId);
  const data = parse(inventoryValidateSchema, req.body);
  res.json(await inventoryService.validateLine(lineId, data.decision, data.lossReason ?? undefined, req.user!.id));
});

router.post('/:id/close', requirePermission('inventory:decide'), async (req, res) => {
  res.json(await inventoryService.closeInventory(toBigInt(req.params.id), req.user!.id));
});

export default router;