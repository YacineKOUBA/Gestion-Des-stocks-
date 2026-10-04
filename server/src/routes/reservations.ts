import { Router } from 'express';
import * as reservationService from '../services/reservationService';
import { parse, toBigInt } from '../utils/parse';
import { reservationSchema } from '../validators';
import { requirePermission } from '../middlewares/permissions';

/**
 * Un identifiant de query optionnel. `Number('')` vaut 0 et `Number('abc')` vaut
 * NaN : les deux passeraient pour un identifiant saisi, et 0 ne designe aucun
 * acteur. On ne traduit donc que ce qui est un entier strictement positif.
 */
function parseOptionalId(raw: unknown): number | undefined {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

// D16 : la fenetre RESERVATION reste ouverte a tous les profils qui y ont acces
// (comme les mouvements, les prets ou les bons), mais le module est desormais protege :
// l'ouverture par defaut aurait donne acces a TOP_MANAGEMENT sans le vouloir.
const router = Router();

router.get('/', requirePermission('reservation:read'), async (req, res) => {
  res.json(
    await reservationService.listReservations({
      status: req.query.status as string | undefined,
      partnerId: req.query.partnerId ? Number(req.query.partnerId) : undefined,
    }),
  );
});

router.get('/synthesis', requirePermission('reservation:read'), async (_req, res) => {
  res.json(await reservationService.synthesis());
});

// Disponibilite d'un article + detail FEFO (quels lots seraient consommes) : alimente
// le controle de quantite du formulaire.
//
// D21 : `partnerId` designe lacteur pour lequel on veut le plafond. Sans lui,
// l'appel renvoie le plafond theorique du produit (cumul nul) : la page doit
// toujours le passer, sinon le formulaire afficherait le mauvais reste.
router.get('/availability/:articleId', requirePermission('reservation:read'), async (req, res) => {
  const partnerId = parseOptionalId(req.query.partnerId);
  res.json(await reservationService.availability(Number(req.params.articleId), partnerId));
});

router.get('/:id', requirePermission('reservation:read'), async (req, res) => {
  res.json(await reservationService.getReservation(toBigInt(req.params.id)));
});

router.post('/', requirePermission('reservation:write'), async (req, res) => {
  const data = parse(reservationSchema, req.body);
  res.status(201).json(await reservationService.createReservation(data, req.user!.id));
});

// Cas 2 : l'utilisateur valide -> l'acteur a recupere sa reservation, les articles
// sortent reellement (tracee comme une VALIDATION dans le journal d'audit).
// `reservation:decide` et non `reservation:write` : la validation autorise une
// sortie physique du stock, ce n'est pas une simple gestion de la reservation.
// Elle reste donc separee de la creation et de l'annulation (D19).
router.post('/:id/valider', requirePermission('reservation:decide'), async (req, res) => {
  res.json(await reservationService.validateReservation(toBigInt(req.params.id), req.user!.id));
});

// Cas 1 : l'utilisateur annule -> le stock est immediatement rendu.
router.post('/:id/annuler', requirePermission('reservation:write'), async (req, res) => {
  res.json(await reservationService.cancelReservation(toBigInt(req.params.id), req.user!.id));
});

export default router;
