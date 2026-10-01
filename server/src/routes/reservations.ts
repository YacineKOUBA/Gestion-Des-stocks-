import { Router } from 'express';
import * as reservationService from '../services/reservationService';
import { parse, toBigInt } from '../utils/parse';
import { reservationSchema } from '../validators';

// Fenetre RESERVATION : accessible a TOUS les types d'utilisateurs (pas de requireRole),
// comme les mouvements, les prets ou les bons.
const router = Router();

router.get('/', async (req, res) => {
  res.json(
    await reservationService.listReservations({
      status: req.query.status as string | undefined,
      partnerId: req.query.partnerId ? Number(req.query.partnerId) : undefined,
    }),
  );
});

router.get('/synthesis', async (_req, res) => {
  res.json(await reservationService.synthesis());
});

// Disponibilite d'un article + detail FEFO (quels lots seraient consommes) : alimente
// le controle de quantite du formulaire.
router.get('/availability/:articleId', async (req, res) => {
  res.json(await reservationService.availability(Number(req.params.articleId)));
});

router.get('/:id', async (req, res) => {
  res.json(await reservationService.getReservation(toBigInt(req.params.id)));
});

router.post('/', async (req, res) => {
  const data = parse(reservationSchema, req.body);
  res.status(201).json(await reservationService.createReservation(data, req.user!.id));
});

// Cas 2 : l'utilisateur valide -> l'acteur a recupere sa reservation, les articles
// sortent reellement (tracee comme une VALIDATION dans le journal d'audit).
router.post('/:id/valider', async (req, res) => {
  res.json(await reservationService.validateReservation(toBigInt(req.params.id), req.user!.id));
});

// Cas 1 : l'utilisateur annule -> le stock est immediatement rendu.
router.post('/:id/annuler', async (req, res) => {
  res.json(await reservationService.cancelReservation(toBigInt(req.params.id), req.user!.id));
});

export default router;
