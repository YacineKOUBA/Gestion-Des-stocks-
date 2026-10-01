import { Router } from 'express';
import { kpis, alerts, lotsFlags, stockByCategory } from '../services/dashboardService';

const router = Router();

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