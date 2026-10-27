import { Router } from 'express';
import { MoveTypeCode } from '@prisma/client';
import { prisma } from '../prisma';
import { can } from '../auth/permissions';
import { createMovement, cancelMovement, reactivateMovement, deleteMovement, updateMovement } from '../services/movementService';
import { forbidden } from '../utils/apiError';
import { parse, toBigInt } from '../utils/parse';
import { movementSchema, movementUpdateSchema, reactivateSchema } from '../validators/movement';
import { requirePermission } from '../middlewares/permissions';

const router = Router();

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

router.get('/', requirePermission('movement:read'), async (req, res) => {
  const q = req.query;
  const where: Record<string, unknown> = {};
  if (q.articleId) where.articleId = Number(q.articleId);
  if (q.depotId) where.depotId = Number(q.depotId);
  if (q.lotId) where.lotId = Number(q.lotId);
  if (q.type) where.type = { code: q.type };
  // Exclusion d'un type (utilisee par la page Mouvement pour retirer definitivement
  // la PERTE de la liste et du comptage). Elle s'applique au comptage ET a la
  // requete, sinon la pagination et le total « X sur N » compteraient des lignes
  // invisibles. Un filtre `type` explicite reste prioritaire et exclut deja les
  // autres types.
  else if (q.excludeType) where.type = { code: { not: String(q.excludeType) } };
  if (q.from) where.movementDate = { gte: new Date(String(q.from)) };
  if (q.to) where.movementDate = { ...(where.movementDate as object), lte: new Date(String(q.to)) };

  // Pagination : le plafond de 500 est dur, mais le total reel est toujours renvoye
  // dans X-Total-Count pour que le client affiche "X sur N" au lieu de tronquer en silence.
  const limitRaw = Number(q.limit);
  const offsetRaw = Number(q.offset);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) && limitRaw > 0 ? Math.trunc(limitRaw) : DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.trunc(offsetRaw) : 0;

  const [total, moves] = await prisma.$transaction([
    prisma.move.count({ where }),
    prisma.move.findMany({
      where,
      include: {
        type: true,
        article: { select: { code: true, designation: true, unit: { select: { code: true, label: true } } } },
        lot: true,
        depot: true,
        location: true,
        partner: { select: { name: true } },
      },
      // id en second critere : tri stable indispensable pour que la pagination ne
      // fasse pas sauter des mouvements de meme date entre deux pages.
      orderBy: [{ movementDate: 'desc' }, { id: 'desc' }],
      take: limit,
      skip: offset,
    }),
  ]);

  res.setHeader('X-Total-Count', String(total));
  res.setHeader('X-Limit', String(limit));
  res.setHeader('X-Offset', String(offset));
  res.json(moves);
});

router.post('/', requirePermission('movement:write'), async (req, res) => {
  const input = parse(movementSchema, req.body);
  // D26 : l'AJUSTEMENT est reserve a l'administrateur (demande de la direction generale).
  // Le controle porte sur la route de SAISIE MANUELLE : la cloture d'inventaire genere
  // egalement des AJUSTEMENT, mais elle passe par `inventory:decide`, deja reserve a
  // l'administrateur, et n'emprunte donc pas cette porte.
  if (input.type === MoveTypeCode.AJUSTEMENT && !can(req.user!.role, 'movement:adjust')) {
    throw forbidden("Le mouvement d'AJUSTEMENT est réservé à l'administrateur");
  }
  // D31 : le Magasinier ne choisit pas la date d'un nouveau mouvement, elle est
  // ATTRIBUEE automatiquement (le jour meme). Le champ est desactive dans le formulaire,
  // mais un champ desactive ne protege rien : n'importe quel appel direct a l'API
  // pourrait antidater une ecriture et fausser l'historique et le stock valorise a une
  // date donnee. On ignore donc la date recue pour ce profil, sans refuser la requete
  // (la saisie reste possible, c'est la date qui n'est pas negociable).
  const movementDate =
    req.user!.role === 'MAGASINIER' ? new Date() : new Date(input.movementDate);
  const move = await createMovement({ ...input, movementDate }, req.user!.id);
  res.status(201).json(move);
});

// D30 : modification d'une ligne de mouvement existante. Reservee a l'administrateur
// (`movement:edit`) : corriger une ligne deja ecrite deplace du stock et peut decaler un
// bon, un pret ou une ligne d'inventaire qui s'y adossent. La route applique les memes
// controles que la creation, empietement de reservation compris (jeton renvoye en 409).
router.put('/:id', requirePermission('movement:edit'), async (req, res) => {
  const id = toBigInt(req.params.id);
  const input = parse(movementUpdateSchema, req.body);
  const move = await updateMovement(
    id,
    { ...input, movementDate: new Date(input.movementDate) },
    req.user!.id,
  );
  res.json(move);
});

// Annulation / reactivation / suppression : correction apres coup, reservee a l'administrateur.
router.patch('/:id/cancel', requirePermission('movement:revise'), async (req, res) => {
  const id = toBigInt(req.params.id);
  // F3 : annuler une ENTREE, ou la moitie SORTIE d'un TRANSFERT, retire du stock ;
  // l'operation est donc soumise au meme controle d'empietement que la creation et
  // que la reactivation. Le client renvoie le jeton signe si l'utilisateur a accepte
  // l'amputation des reservations.
  const data = parse(reactivateSchema, req.body ?? {});
  res.json(await cancelMovement(id, req.user!.id, data.confirmToken ?? null));
});

router.patch('/:id/reactivate', requirePermission('movement:revise'), async (req, res) => {
  const id = toBigInt(req.params.id);
  // D20 : reactiver un mouvement SORTIE retire a nouveau du stock, l'operation est
  // donc soumise au meme controle d'empietement que la creation. Le client renvoie
  // le jeton signe si l'utilisateur a accepte l'amputation des reservations.
  const data = parse(reactivateSchema, req.body ?? {});
  res.json(await reactivateMovement(id, req.user!.id, data.confirmToken ?? null));
});

// Suppression complete d'un mouvement ANNULÉ du journal des E/S (tracée dans l'audit).
router.delete('/:id', requirePermission('movement:revise'), async (req, res) => {
  const id = toBigInt(req.params.id);
  res.json(await deleteMovement(id, req.user!.id));
});

export default router;