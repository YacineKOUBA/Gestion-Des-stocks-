import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { conflict } from '../utils/apiError';
import { decodeConfirmToken, issueConfirmToken } from '../utils/confirmToken';
import { dec, toNumber } from '../utils/decimal';

/**
 * Correction des DOCUMENTS lies a un mouvement du journal.
 *
 * Un mouvement n'est pas toujours une saisie libre : il peut etre la trace d'un
 * pret, d'un emprunt, d'une restitution, de la validation d'une reservation ou de
 * la cloture d'une ligne d'inventaire. Annuler une telle ligne sans toucher au
 * document qui l'a produite laisserait ce document dans un etat faux (solde de
 * pret, statut de reservation, ecart d'inventaire).
 *
 * Le serveur refuse donc d'abord l'annulation (409) en listant les liens et les
 * consequences. Si l'administrateur confirme, la correction est appliquee dans la
 * MEME transaction que l'annulation : soit tout passe, soit rien ne passe. Le
 * stock, lui, se recalcule tout seul puisque l'annulation retire la ligne des
 * mouvements ACTIFS.
 */

type Db = Prisma.TransactionClient | typeof prisma;

export const CANCEL_LINK_OP = 'ANNULATION_MOUVEMENT_LIE';

export type MovementLinkKind =
  | 'PRET'
  | 'EMPRUNT'
  | 'RESTITUTION_PRET'
  | 'RESTITUTION_EMPRUNT'
  | 'RESERVATION'
  | 'INVENTAIRE';

/** Un document lie, tel que l'interface le presente avant confirmation. */
export interface MovementLinkInfo {
  kind: MovementLinkKind;
  /** Libelle court : « Prêt », « Restitution de prêt », « Réservation »... */
  label: string;
  /** Reference lisible : « Prêt #12 », « Réservation RES-2026-001 »... */
  ref: string;
  /** Qui / quoi / combien : acteur, article, quantite. */
  detail: string;
  /** Ce que la confirmation va changer pour ce document. */
  consequence: string;
}

/** Charge utile renvoyee au client avec le code MOUVEMENT_LIE_A_CONFIRMATION. */
export interface LinkedMovementConfirmation {
  kind: 'MOUVEMENT_LIE';
  message: string;
  links: MovementLinkInfo[];
  confirmToken: string;
}

/** Forme minimale du mouvement, chargee avec ses liens par `cancelMovement`. */
export interface LinkedMove {
  id: bigint;
  articleId: number;
  reservationId: bigint | null;
  inventoryId: bigint | null;
  loan: {
    id: bigint;
    type: 'PRET' | 'EMPRUNT';
    quantity: Prisma.Decimal;
    partner: { name: string };
    article: { code: string; designation: string };
    _count: { restitutions: number };
  } | null;
  restitutions: Array<{
    id: bigint;
    loanId: bigint;
    type: 'RESTITUTION_PRET' | 'RESTITUTION_EMPRUNT';
    quantity: Prisma.Decimal;
    loan: {
      id: bigint;
      type: 'PRET' | 'EMPRUNT';
      quantity: Prisma.Decimal;
      partner: { name: string };
      article: { code: string; designation: string };
    };
  }>;
  reservation: {
    id: bigint;
    ref: string;
    status: string;
    partner: { name: string };
  } | null;
  inventoryLine: {
    id: bigint;
    inventoryId: bigint;
    inventory: { id: bigint; code: string; status: string };
  } | null;
}

/**
 * Vrai si la DERNIERE annulation de ce mouvement a corrigé un document lié.
 *
 * Les liens de prêt/restitution disparaissent avec le document lui-même (le prêt
 * ou la restitution est supprimé) : la trace d'audit est alors le seul moyen de
 * savoir que la ligne n'est pas une saisie libre et qu'elle ne doit pas être
 * réactivée seule. Les liens de réservation et d'inventaire, eux, restent portés
 * par le mouvement (`reservationId`, `inventoryId`) et sont testés directement.
 */
export async function wasLinkedCancellation(moveId: bigint): Promise<boolean> {
  const entry = await prisma.auditLog.findFirst({
    where: { entity: 'movement', entityId: String(moveId), action: 'ANNULATION' },
    orderBy: { id: 'desc' },
    select: { changes: true },
  });
  const changes = entry?.changes as { linkedDocuments?: Record<string, unknown> } | null;
  const linked = changes?.linkedDocuments;
  return !!linked && Object.keys(linked).length > 0;
}

export function issueCancelLinkToken(moveId: bigint, userId: number): string {
  return issueConfirmToken({ op: CANCEL_LINK_OP, move: String(moveId), user: userId });
}

/** Vrai si le jeton presenté confirme bien l'annulation de CE mouvement par CET utilisateur. */
export function verifyCancelLinkToken(
  token: string | null | undefined,
  moveId: bigint,
  userId: number,
): boolean {
  const body = decodeConfirmToken(token);
  return (
    !!body &&
    body.op === CANCEL_LINK_OP &&
    body.move === String(moveId) &&
    body.user === userId
  );
}

/**
 * Annulation impossible tant que le pret/emprunt possede des restitutions : les
 * supprimer en cascade effacerait des retours deja enregistres, alors que la
 * consigne est de remonter le temps document par document.
 */
export function blockingLinkMessage(move: LinkedMove): string | null {
  if (!move.loan) return null;
  const n = move.loan._count.restitutions;
  if (n <= 0) return null;
  const label = move.loan.type === 'PRET' ? 'prêt' : 'emprunt';
  return (
    `Annulation impossible : ce mouvement est lié au ${label} #${move.loan.id}, ` +
    `qui possède déjà ${n} restitution${n > 1 ? 's' : ''}. ` +
    `Annulez d'abord ${n > 1 ? 'ces restitutions' : 'cette restitution'} depuis la page ` +
    `Prêts & Emprunts, puis annulez ce mouvement.`
  );
}

function quantite(value: Prisma.Decimal): string {
  return `${toNumber(value, 3)} unité(s)`;
}

/**
 * Decrit les documents lies. La consequence de la reservation depend de ce qu'il
 * RESTERA apres annulation : on compte donc des maintenant les sorties ACTIFS de
 * la meme validation, en excluant la ligne visee.
 */
export async function describeMovementLinks(
  move: LinkedMove,
  db: Db = prisma,
): Promise<MovementLinkInfo[]> {
  const links: MovementLinkInfo[] = [];

  if (move.loan) {
    const isPret = move.loan.type === 'PRET';
    links.push({
      kind: move.loan.type,
      label: isPret ? 'Prêt' : 'Emprunt',
      ref: `${isPret ? 'Prêt' : 'Emprunt'} #${move.loan.id}`,
      detail: `${move.loan.partner.name} — ${move.loan.article.code} ${move.loan.article.designation} — ${quantite(move.loan.quantity)}`,
      consequence: isPret
        ? "L'opération de prêt sera supprimée : le prêt disparaîtra de la page Prêts & Emprunts et la sortie de stock sera annulée."
        : "L'opération d'emprunt sera supprimée : l'emprunt disparaîtra de la page Prêts & Emprunts et l'entrée de stock sera annulée.",
    });
  }

  for (const r of move.restitutions) {
    const isPret = r.type === 'RESTITUTION_PRET';
    links.push({
      kind: r.type,
      label: isPret ? 'Restitution de prêt' : 'Restitution d’emprunt',
      ref: `Restitution #${r.id}`,
      detail: `${r.loan.partner.name} — ${r.loan.article.code} ${r.loan.article.designation} — ${quantite(r.quantity)}`,
      consequence:
        `La restitution sera supprimée et le ${r.loan.type === 'PRET' ? 'prêt' : 'emprunt'} #${r.loan.id} ` +
        `sera recalculé à partir des restitutions restantes (statut OUVERT, PARTIEL ou CLOTURÉ).`,
    });
  }

  if (move.reservation) {
    const restants = await db.move.count({
      where: {
        reservationId: move.reservation.id,
        status: 'ACTIF',
        id: { not: move.id },
      },
    });
    const cible = restants === 0 ? 'ACTIF (rouverte)' : 'PARTIELLEMENT_REALISE';
    links.push({
      kind: 'RESERVATION',
      label: 'Validation de réservation',
      ref: `Réservation ${move.reservation.ref}`,
      detail: `${move.reservation.partner.name} — statut actuel ${move.reservation.status}`,
      consequence:
        restants === 0
          ? `Cette sortie est la dernière de la validation : la réservation sera rouverte (${cible}) et pourra être validée à nouveau.`
          : `Il reste ${restants} sortie(s) active(s) pour cette validation : la réservation passera à ${cible}.`,
    });
  }

  if (move.inventoryLine) {
    links.push({
      kind: 'INVENTAIRE',
      label: 'Clôture d’inventaire',
      ref: `Inventaire ${move.inventoryLine.inventory.code}`,
      detail: `Ligne #${move.inventoryLine.id} — l'écart validé porte sur ce mouvement`,
      consequence:
        "La ligne d'inventaire sera rouverte (statut « compté », décision effacée) et la campagne sera rouverte si elle était clôturée.",
    });
  }

  return links;
}

/** Construit le refus 409 qui demande la confirmation de l'administrateur. */
export function linkedMovementConfirmation(
  moveId: bigint,
  userId: number,
  links: MovementLinkInfo[],
): LinkedMovementConfirmation {
  return {
    kind: 'MOUVEMENT_LIE',
    message:
      `Ce mouvement est lié à ${links.length} document${links.length > 1 ? 's' : ''} : ` +
      `${links.map((l) => l.ref).join(', ')}. ` +
      `En confirmant, le stock sera recalculé et ${links.length > 1 ? 'ces documents seront corrigés' : 'ce document sera corrigé'} ` +
      `comme s'il n'avait jamais été produit par ce mouvement.`,
    links,
    confirmToken: issueCancelLinkToken(moveId, userId),
  };
}

/**
 * Applique la correction des documents lies, DANS la transaction d'annulation.
 * Le mouvement n'est pas encore passé à ANNULE : les comptages ci-dessous excluent
 * donc explicitement la ligne visee.
 */
export async function applyLinkedCancellation(
  tx: Prisma.TransactionClient,
  move: LinkedMove,
): Promise<Record<string, unknown>> {
  const applied: Record<string, unknown> = {};

  // 1. Prêt / emprunt : l'opération redevient ce qu'elle était AVANT le mouvement,
  // c'est-à-dire qu'elle n'existe pas. Les restitutions doivent avoir été annulées
  // avant (contrôle préalable) : on revérifie sous verrou pour couvrir une course.
  if (move.loan) {
    const restitutions = await tx.loanRestitution.count({ where: { loanId: move.loan.id } });
    if (restitutions > 0) {
      throw conflict(blockingLinkMessage(move) ?? 'Annulation impossible : des restitutions existent.');
    }
    await tx.loan.delete({ where: { id: move.loan.id } });
    applied.loanDeleted = { id: String(move.loan.id), type: move.loan.type };
  }

  // 2. Restitution : la ligne disparaît et le prêt retrouve son statut, calculé
  // sur les restitutions restantes (même règle que `createRestitution`).
  if (move.restitutions.length > 0) {
    const deleted: Array<{ id: string; loanId: string; status: string }> = [];
    for (const r of move.restitutions) {
      await tx.loanRestitution.delete({ where: { id: r.id } });
      const agg = await tx.loanRestitution.aggregate({
        where: { loanId: r.loanId },
        _sum: { quantity: true },
      });
      const rendu = dec(agg._sum.quantity ?? 0);
      const total = dec(r.loan.quantity);
      const status = rendu.lessThanOrEqualTo(0)
        ? 'OUVERT'
        : rendu.greaterThanOrEqualTo(total)
          ? 'CLOTURE'
          : 'PARTIEL';
      await tx.loan.update({ where: { id: r.loanId }, data: { status } });
      deleted.push({ id: String(r.id), loanId: String(r.loanId), status });
    }
    applied.restitutionsDeleted = deleted;
  }

  // 3. Réservation : la validation est défaite. On ne rouvre que si plus aucune
  // sortie ACTIVE ne porte cette réservation ; sinon les sorties restantes sont
  // toujours en stock et la réservation reste partiellement réalisée.
  if (move.reservationId != null) {
    const restants = await tx.move.count({
      where: {
        reservationId: move.reservationId,
        status: 'ACTIF',
        id: { not: move.id },
      },
    });
    if (restants === 0) {
      await tx.reservation.update({
        where: { id: move.reservationId },
        data: { status: 'ACTIF', closedBy: null, closedAt: null, closeReason: null },
      });
      applied.reservation = { id: String(move.reservationId), status: 'ACTIF' };
    } else {
      await tx.reservation.update({
        where: { id: move.reservationId },
        data: { status: 'PARTIELLEMENT_REALISE', closeReason: 'VALIDEE_PARTIELLE' },
      });
      applied.reservation = {
        id: String(move.reservationId),
        status: 'PARTIELLEMENT_REALISE',
        sortiesRestantes: restants,
      };
    }
  }

  // 4. Inventaire : la ligne redevient « comptée » et la campagne est rouverte si
  // elle était clôturée. Sans cela, une campagne close afficherait un écart validé
  // dont le mouvement n'existe plus.
  if (move.inventoryLine) {
    const line = move.inventoryLine;
    await tx.inventoryLine.update({
      where: { id: line.id },
      data: {
        status: 'COMPTE',
        decision: null,
        lossReason: null,
        movementId: null,
        validatedBy: null,
        validatedAt: null,
      },
    });
    const reopened = line.inventory.status === 'CLOTUREE';
    if (reopened) {
      await tx.inventory.update({
        where: { id: line.inventoryId },
        data: { status: 'OUVERTE', closedBy: null, closedAt: null },
      });
    }
    applied.inventoryReopened = {
      lineId: String(line.id),
      inventoryId: String(line.inventoryId),
      campaignReopened: reopened,
    };
  }

  return applied;
}
