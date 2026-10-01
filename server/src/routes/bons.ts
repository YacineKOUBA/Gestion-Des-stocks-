import { Router } from 'express';
import * as bonService from '../services/bonService';
import { parse, toBigInt } from '../utils/parse';
import { bonSchema } from '../validators';
import { requirePermission } from '../middlewares/permissions';

const router = Router();

// Documents (bons de sortie / livraison / transfert / retour).
// D16 : ce module n'etait protege par AUCUNE porte. Il le devient, sinon un profil
// de consultation comme TOP_MANAGEMENT y aurait acces par defaut.
router.get('/', requirePermission('bon:read'), async (_req, res) => {
  res.json(await bonService.listBons());
});

router.get('/:id', requirePermission('bon:read'), async (req, res) => {
  res.json(await bonService.getBon(toBigInt(req.params.id)));
});

router.post('/', requirePermission('bon:write'), async (req, res) => {
  const data = parse(bonSchema, req.body);
  res.status(201).json(await bonService.createBon(data, req.user!.id));
});

export default router;