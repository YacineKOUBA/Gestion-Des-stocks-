import { Router } from 'express';
import { prisma } from '../prisma';
import * as reservationService from '../services/reservationService';
import { parse, toBigInt } from '../utils/parse';
import { reservationSchema } from '../validators';
import { requirePermission } from '../middlewares/permissions';
import { forbidden, notFound } from '../utils/apiError';

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
  // D33 : le role determine si on cree une DEMANDE ou une RESERVATION REELLE
  res.status(201).json(await reservationService.createReservation(data, req.user!.id, req.user!.role));
});

// D33 : approuver une DEMANDE pour la transformer en reservation REELLE (ACTIF)
// sans creer de mouvement. Reserve a ADMIN et TOP_MANAGEMENT.
router.post('/:id/approuver', requirePermission('reservation:approve'), async (req, res) => {
  res.json(await reservationService.approveReservation(toBigInt(req.params.id), req.user!.id));
});

// D33 : refuser une DEMANDE -> REFUSE, ne devient jamais reelle. Reserve a ADMIN et TOP_MANAGEMENT.
router.post('/:id/refuser', requirePermission('reservation:approve'), async (req, res) => {
  res.json(await reservationService.refuseReservation(toBigInt(req.params.id), req.user!.id));
});

// Cas 2 : l'utilisateur valide -> l'acteur a recupere sa reservation, les articles
// sortent reellement (tracee comme une VALIDATION dans le journal d'audit).
// `reservation:decide` et non `reservation:write` : la validation autorise une
// sortie physique du stock, ce n'est pas une simple gestion de la reservation.
// Elle reste donc separee de la creation et de l'annulation (D19).
// D33 : ne fonctionne que sur une reservation REELLE (ACTIF).
// D34 : validation partielle possible avec { partial: [{ lineId, quantityTaken }, ...] }
router.post('/:id/valider', requirePermission('reservation:decide'), async (req, res) => {
  const partial = Array.isArray(req.body?.partial) ? req.body.partial : undefined;
  res.json(await reservationService.validateReservation(toBigInt(req.params.id), req.user!.id, partial));
});

// Cas 1 : l'utilisateur annule -> le stock est immediatement rendu.
// D33 : une DEMANDE peut etre annulee par SALES_ADMIN, ADMIN, TOP_MANAGEMENT.
// Une RESERVATION REELLE (ACTIF) ne peut etre annulee QUE par ADMIN ou TOP_MANAGEMENT.
router.post('/:id/annuler', requirePermission('reservation:write'), async (req, res) => {
  const id = toBigInt(req.params.id);
  const current = await prisma.reservation.findUnique({ where: { id }, select: { status: true } });
  if (!current) throw notFound('Réservation introuvable');
  if (current.status === 'ACTIF' && req.user!.role === 'SALES_ADMIN') {
    throw forbidden("L'administration des ventes ne peut annuler que les demandes de réservation");
  }
  res.json(await reservationService.cancelReservation(id, req.user!.id));
});

export default router;
