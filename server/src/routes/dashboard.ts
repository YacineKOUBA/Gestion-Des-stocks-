import { Router } from 'express';
import { kpis, alerts, lotsFlags, stockByCategory } from '../services/dashboardService';
import { requirePermission } from '../middlewares/permissions';

const router = Router();

router.use(requirePermission('dashboard:read'));

router.get('/kpis', async (_req, res) => {
  res.json(await kpis());
});

router.get('/alerts', async (_req, res) => {
  res.json(await alerts());
});

router.get('/lots-flags', async (_req, res) => {
  res.json(await lotsFlags());
});

router.get('/stock-by-category', async (_req, res) => {
  res.json(await stockByCategory());
});

export default router;