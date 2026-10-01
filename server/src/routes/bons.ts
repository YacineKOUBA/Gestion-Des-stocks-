import { Router } from 'express';
import * as bonService from '../services/bonService';
import { parse, toBigInt } from '../utils/parse';
import { bonSchema } from '../validators';

const router = Router();

router.get('/', async (_req, res) => {
  res.json(await bonService.listBons());
});

router.get('/:id', async (req, res) => {
  res.json(await bonService.getBon(toBigInt(req.params.id)));
});

router.post('/', async (req, res) => {
  const data = parse(bonSchema, req.body);
  res.status(201).json(await bonService.createBon(data, req.user!.id));
});

export default router;