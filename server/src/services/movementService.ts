import { prisma } from '../prisma';
import { MoveTypeCode, Prisma } from '@prisma/client';
import { badRequest, conflict, notFound } from '../utils/apiError';
import { audit } from '../utils/audit';
import { dec, toNumber } from '../utils/decimal';
import { verifyConfirmToken } from '../utils/confirmToken';
import {
  consumeOverlap,
  detectOverlap,
  issueOverlapToken,
  overlapTokenPayload,
} from './reservationOverlap';

export interface MoveInput {
  type: MoveTypeCode;
  articleId: number;
  quantity: number;
  movementDate: Date;
  depotId: number;
  locationId?: number | null;
  depotDestId?: number | null;
  locationDestId?: number | null;
  lotId?: number | null;
  partnerId?: number | null;
  docNumber?: string | null;
  unitPrice?: number | null;
  currency?: string | null;
  observation?: string | null;
  sens?: number | null;
  inventoryId?: bigint | null;
  /**
   * D20, decision 7 : jeton renvoye par un refus d'empietement sur stock reserve.
   * L'operation est rejouee a l'identique, avec ce jeton, une fois que
   * l'utilisateur a confirme. Sans jeton valide, l'ecriture est refusee.
   */
  confirmToken?: string | null;
}

type Db = Prisma.TransactionClient;

/** Somme precise (Decimal) du stock disponible pour un article/lot/depot/emplacement. */
async function availableStockDeci(
  opts: {
    articleId: number;
    lotId?: number | null;
    depotId?: number;
    locationId?: number | null;
    excludeIds?: bigint[];
  },
  db: Db = prisma,
): Promise<Prisma.Decimal> {
  const moves = await db.move.findMany({
    where: {
      articleId: opts.articleId,
      status: 'ACTIF',
      depotId: opts.depotId,
      locationId: opts.locationId ?? null,
      lotId: opts.lotId === undefined ? undefined : opts.lotId,
      ...(opts.excludeIds && opts.excludeIds.length ? { id: { notIn: opts.excludeIds } } : {}),
    },
    select: { quantity: true, sens: true },
  });
  return moves.reduce<Prisma.Decimal>((acc, m) => acc.add(dec(m.quantity).mul(m.sens)), new Prisma.Decimal(0));
}

/** Stock disponible (number, arrondi 3 decimales) pour un article/lot/depot/emplacement. */
export async function availableStock(
  opts: {
    articleId: number;
    lotId?: number | null;
    depotId?: number;
    locationId?: number | null;
    excludeIds?: bigint[];
  },
  db: Db = prisma,
): Promise<number> {
  return toNumber(await availableStockDeci(opts, db));
}

async function assertLotRequired(input: MoveInput, db: Db) {
  const article = await db.article.findUnique({
    where: { id: input.articleId },
    select: { isLotTracked: true, currency: true },
  });
  if (!article) throw notFound('Article introuvable');
  if (article.isLotTracked && !input.lotId) {
    throw badRequest("Le lot est obligatoire pour cet article (lot-tracé)");
  }
  return article;
}

/**
 * Verrou pessimiste sur la ligne Article (SELECT ... FOR UPDATE) pour serialiser
 * les mouvements concurrents et eviter la survente (check-then-act).
 */
async function lockArticle(tx: Db, articleId: number) {
  await tx.$queryRaw`SELECT id FROM "articles" WHERE id = ${articleId} FOR UPDATE`;
}

/**
 * Verifie la disponibilite sur la cellule source et RENVOIE son stock. Le stock
 * est reutilise par le controle d'empietement D20 : les deux portent sur la meme
 * cellule (article + lot + depot + emplacement), le recalculer serait une seconde
 * requete identique.
 */
async function assertAvailable(input: MoveInput, checkDepotId: number, db: Db): Promise<Prisma.Decimal> {
  const stock = await availableStockDeci(
    {
      articleId: input.articleId,
      lotId: input.lotId,
      depotId: checkDepotId,
      locationId: input.locationId,
    },
    db,
  );
  if (stock.lessThan(dec(input.quantity))) {
    throw badRequest(
      `Stock insuffisant pour l'article ${input.articleId} (disponible : ${toNumber(stock)})`,
    );
  }
  return stock;
}

/**
 * Un RETOUR rend de la merchandise sortie chez un client : il est donc refuse sur un
 * article qui n'a jamais eu de SORTIE, et le total rendu ne peut pas depasser le total
 * sorti.
 *
 * Seuls les mouvements SORTIE comptent comme departs client. PERTE et TRANSFERT
 * sont exclus : une perte retrouvee se regle par un AJUSTEMENT (qui reintegre
 * le stock). Les reservations n'ont plus de type de mouvement du tout (D20) :
 * une reservation honoree genere un vrai SORTIE a la validation, et c'est ce
 * SORTIE-la qui compte comme depart client.
 */
async function assertRetourCoherent(input: MoveInput, db: Db) {
  const mouvements = await db.move.findMany({
    where: { articleId: input.articleId, status: 'ACTIF', type: { code: MoveTypeCode.SORTIE } },
    select: { sens: true, quantity: true },
  });

  const sorti = mouvements.reduce<Prisma.Decimal>((acc, m) => (m.sens < 0 ? acc.add(dec(m.quantity)) : acc), new Prisma.Decimal(0));
  const rendus = await db.move.findMany({
    where: { articleId: input.articleId, status: 'ACTIF', type: { code: MoveTypeCode.RETOUR } },
    select: { sens: true, quantity: true },
  });
  const rendu = rendus.reduce<Prisma.Decimal>((acc, m) => (m.sens > 0 ? acc.add(dec(m.quantity)) : acc), new Prisma.Decimal(0));

  if (sorti.lessThanOrEqualTo(0)) {
    throw badRequest(
      "Un retour rend de la marchandise déjà sortie : aucun mouvement SORTIE n'existe pour cet article. Enregistrez d'abord la sortie correspondante, sinon le retour créerait du stock sans origine.",
    );
  }
  const cumul = rendu.add(dec(input.quantity));
  if (cumul.greaterThan(sorti)) {
    throw badRequest(
      `Le retour dépasse les sorties de l'article (total sorti : ${toNumber(sorti)}, déjà retourné : ${toNumber(rendu)}). Vérifiez les mouvements de l'article ou enregistrez la sortie manquante avant de relancer ce retour.`,
    );
  }
}

/**
 * D20, regle 3 — POINT DE CONTROLE UNIQUE.
 *
 * Toute operation qui retire du stock passe ici : sortie, perte, ajustement
 * negatif, pret, et cloture d'inventaire. Ces operations creent toutes leurs
 * mouvements par `createMovement`, il n'y a donc aucune autre porte a surveiller.
 *
 * Une reservation ACTIF fige des lots sans toucher au stock. Si l'operation
 * retire plus que ce que le stock laisse une fois les promesses honorees, elle
 * mord dans une promesse : on refuse, on explique (Y, X, Z, overlap = X + Z − Y)
 * et on rend un jeton. Le client repose la meme operation avec ce jeton si et
 * seulement si l'utilisateur a repondu oui ; l'accord preleve alors exactement
 * `overlap` unites sur les promesses concernees, ce qui laisse la promesse
 * restante egale au stock restant.
 *
 * Le controle est volontairement place APRES les tests de disponibilite : inutile
 * de demander a l'utilisateur d'accepter une amputation sur une operation qui de
 * toute facon echouerait.
 */
async function assertNoReservedOverlap(
  input: MoveInput,
  sens: number,
  stockCellule: Prisma.Decimal | null,
  userId: number,
  db: Db,
) {
  if (sens >= 0 || stockCellule === null) return;

  const cell = {
    articleId: input.articleId,
    lotId: input.lotId ?? null,
    depotId: input.depotId,
    locationId: input.locationId ?? null,
  };

  const conflit = await detectOverlap(
    { cell, stockCellule, quantite: dec(input.quantity), operation: input.type },
    db,
  );
  if (!conflit) return;

  const payload = overlapTokenPayload(conflit, userId);
  if (!verifyConfirmToken(input.confirmToken, payload)) {
    throw conflict(conflit.message, {
      code: 'RESERVATION_EMPIETEMENT',
      confirmation: {
        ...conflit,
        // Token a renvoyer tel quel avec la meme operation si l'utilisateur accepte.
        confirmToken: issueOverlapToken(conflit, userId),
      },
    });
  }

  // Accord explicite : on preleve l'overlap sur les promesses concernees.
  const amputations = await consumeOverlap(dec(conflit.overlap), cell, db);
  await audit(userId, 'VALIDATION', 'reservation_allocation', String(conflit.articleId), {
    motif: 'EMPIETEMENT_RESERVATION_CONFIRME',
    operation: input.type,
    articleId: conflit.articleId,
    lot: conflit.lotNumber,
    lotId: conflit.lotId,
    depotId: conflit.depotId,
    locationId: conflit.locationId,
    Y_stockDuLot: conflit.stockCellule,
    X_reserve: conflit.reserve,
    Z_aSortir: conflit.quantite,
    overlap: conflit.overlap,
    formule: 'overlap = X + Z − Y',
    reservations: conflit.reservations,
    amputations,
  });
}

async function createMovementTx(input: MoveInput, userId: number, db: Db) {
  const article = await assertLotRequired(input, db);
  await lockArticle(db, input.articleId);
  const currency = input.currency ?? article.currency ?? 'DZD';

  let sens = input.sens ?? 1;
  switch (input.type) {
    case MoveTypeCode.ENTREE:
    case MoveTypeCode.RETOUR:
      sens = 1;
      break;
    case MoveTypeCode.SORTIE:
    case MoveTypeCode.PERTE:
      sens = -1;
      break;
    case MoveTypeCode.AJUSTEMENT:
      sens = input.sens ?? 1;
      break;
    case MoveTypeCode.TRANSFERT:
      sens = -1;
      break;
  }

  // Controle de disponibilite pour les mouvements negatifs (0.4 : bloquer).
  // Le stock de la cellule source est conserve : c'est le Y du controle D20.
  let stockCellule: Prisma.Decimal | null = null;
  if (input.type === MoveTypeCode.SORTIE || input.type === MoveTypeCode.PERTE) {
    stockCellule = await assertAvailable(input, input.depotId, db);
  }
  if (input.type === MoveTypeCode.AJUSTEMENT && sens < 0) {
    stockCellule = await assertAvailable(input, input.depotId, db);
  }
  if (input.type === MoveTypeCode.RETOUR) {
    await assertRetourCoherent(input, db);
  }
  if (input.type === MoveTypeCode.TRANSFERT) {
    if (!input.depotDestId) {
      throw badRequest('Un TRANSFERT nécessite un dépôt destination');
    }
    if (input.depotDestId === input.depotId) {
      throw badRequest('Dépôt source et destination identiques');
    }
    stockCellule = await assertAvailable(input, input.depotId, db);
  }

  // D20, regle 3 : seul passage oblige pour toute operation qui retire du stock.
  await assertNoReservedOverlap(input, sens, stockCellule, userId, db);

  const typeId = (await db.moveType.findUniqueOrThrow({ where: { code: input.type } })).id;

  const data = {
    typeId,
    articleId: input.articleId,
    quantity: input.quantity,
    sens,
    movementDate: input.movementDate,
    depotId: input.depotId,
    locationId: input.locationId,
    depotDestId: input.type === MoveTypeCode.TRANSFERT ? input.depotDestId : null,
    locationDestId: input.type === MoveTypeCode.TRANSFERT ? input.locationDestId : null,
    lotId: input.lotId,
    partnerId: input.partnerId,
    docNumber: input.docNumber,
    unitPrice: input.unitPrice,
    currency,
    observation: input.observation,
    inventoryId: input.inventoryId,
    createdBy: userId,
  };

  if (input.type === MoveTypeCode.TRANSFERT) {
    const sortie = await db.move.create({ data: { ...data, sens: -1 } });
    const entree = await db.move.create({
      data: {
        ...data,
        sens: 1,
        depotId: input.depotDestId!,
        depotDestId: null,
        locationId: input.locationDestId,
        locationDestId: null,
        linkMoveId: sortie.id,
      },
    });
    await db.move.update({
      where: { id: sortie.id },
      data: { linkMoveId: entree.id },
    });
    return { sortie, entree };
  }

  return db.move.create({ data });
}

/**
 * Cree un mouvement.
 * - Appel autonome : ouvre une transaction, verrouille l'article et journalise.
 * - Appel compose (db fourni) : s'execute dans la transaction de l'appelant, sans audit
 *   (l'appelant journalise l'operation de plus haut niveau).
 */
export async function createMovement(input: MoveInput, userId: number, db?: Db) {
  if (db) {
    return createMovementTx(input, userId, db);
  }

  const result = await prisma.$transaction((tx) => createMovementTx(input, userId, tx));

  if (input.type === MoveTypeCode.TRANSFERT) {
    const r = result as { sortie: { id: bigint }; entree: { id: bigint } };
    await audit(userId, 'CREATION', 'movement', String(r.sortie.id), {
      type: 'TRANSFERT',
      articleId: input.articleId,
      sortie: r.sortie.id,
      entree: r.entree.id,
    });
  } else {
    const r = result as { id: bigint };
    await audit(userId, 'CREATION', 'movement', String(r.id), {
      type: input.type,
      articleId: input.articleId,
      quantity: input.quantity,
    });
  }
  return result;
}

export async function cancelMovement(moveId: bigint, userId: number) {
  const move = await prisma.move.findUnique({
    where: { id: moveId },
    include: { type: true },
  });
  if (!move) throw notFound('Mouvement introuvable');
  if (move.status === 'ANNULE') throw badRequest('Mouvement déjà annulé');

  const updated = await prisma.$transaction(async (tx) => {
    await tx.move.update({
      where: { id: moveId },
      data: { status: 'ANNULE', canceledBy: userId, canceledAt: new Date() },
    });
    if (move.type.code === MoveTypeCode.TRANSFERT) {
      await tx.move.updateMany({
        where: { linkMoveId: moveId, status: 'ACTIF' },
        data: { status: 'ANNULE', canceledBy: userId, canceledAt: new Date() },
      });
    }
    return move;
  });
  await audit(userId, 'ANNULATION', 'movement', String(moveId), {
    moveId,
  });
  return updated;
}

/**
 * Reactive un mouvement annule (retour au statut ACTIF).
 * Le stock etant recalcule a partir des mouvements ACTIFS, la reactivation
 * modifie le stock disponible : on re-valide donc la disponibilite du stock
 * (hors mouvement reactivé) pour les mouvements qui diminuent le stock,
 * et un TRANSFERT reactive aussi sa moitié liée (entree/sortie).
 */
export async function reactivateMovement(moveId: bigint, userId: number) {
  const move = await prisma.move.findUnique({
    where: { id: moveId },
    include: { type: true },
  });
  if (!move) throw notFound('Mouvement introuvable');
  if (move.status !== 'ANNULE') throw badRequest('Mouvement déjà actif');

  const pairId =
    move.type.code === MoveTypeCode.TRANSFERT
      ? (
          await prisma.move.findFirst({
            where: { linkMoveId: moveId },
            select: { id: true, status: true },
          })
        )?.id ?? null
      : null;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "articles" WHERE id = ${move.articleId} FOR UPDATE`;

    // Re-validation de disponibilite : stock ACTUEL hors mouvement(s) réactive(s).
    if (move.sens < 0) {
      const excludeIds = pairId != null ? [move.id, pairId] : [move.id];
      const stock = await availableStockDeci(
        {
          articleId: move.articleId,
          lotId: move.lotId,
          depotId: move.depotId,
          locationId: move.locationId,
          excludeIds,
        },
        tx,
      );
      if (stock.lessThan(dec(move.quantity))) {
        throw badRequest(
          `Stock insuffisant pour réactiver ce mouvement (disponible : ${toNumber(stock)})`,
        );
      }
    }

    const updatedMove = await tx.move.update({
      where: { id: moveId },
      data: { status: 'ACTIF', canceledBy: null, canceledAt: null },
    });

    if (pairId != null) {
      await tx.move.updateMany({
        where: { id: pairId, status: 'ANNULE' },
        data: { status: 'ACTIF', canceledBy: null, canceledAt: null },
      });
    }
    return updatedMove;
  });

  await audit(userId, 'REACTIVATION', 'movement', String(moveId), {
    moveId,
    type: move.type.code,
    articleId: move.articleId,
    quantity: move.quantity,
  });
  return updated;
}

/**
 * Supprime COMPLETEMENT un mouvement du journal des E/S. Autorise UNIQUEMENT les
 * mouvements annulés (le stock ne tient compte que des mouvements ACTIFS : une
 * suppression ne modifie donc pas le stock). Pour un TRANSFERT annulé, la moitié
 * liée (entree/sortie) est supprimée aussi. Operation journalisée (SUPPRESSION).
 */
export async function deleteMovement(moveId: bigint, userId: number) {
  const move = await prisma.move.findUnique({
    where: { id: moveId },
    include: {
      type: true,
      article: { select: { code: true, designation: true } },
      lot: { select: { lotNumber: true } },
      depot: true,
      location: true,
      partner: { select: { name: true } },
    },
  });
  if (!move) throw notFound('Mouvement introuvable');
  if (move.status !== 'ANNULE') throw badRequest('Seul un mouvement annulé peut être supprimé du journal');

  // Moitié liée d'un TRANSFERT (chacune pointe sur l'autre via linkMoveId).
  let pairId: bigint | null = move.type.code === MoveTypeCode.TRANSFERT ? move.linkMoveId : null;
  if (pairId == null && move.type.code === MoveTypeCode.TRANSFERT) {
    pairId =
      (
        await prisma.move.findFirst({
          where: { linkMoveId: moveId },
          select: { id: true },
        })
      )?.id ?? null;
  }
  if (pairId != null) {
    const pair = await prisma.move.findUnique({
      where: { id: pairId },
      select: { status: true },
    });
    if (!pair || pair.status !== 'ANNULE') pairId = null;
  }

  try {
    const deleted = await prisma.$transaction(async (tx) => {
      // Détache les eventuelles references avant suppression (FK self-reference).
      await tx.move.updateMany({ where: { linkMoveId: moveId }, data: { linkMoveId: null } });
      if (pairId != null) {
        await tx.move.updateMany({ where: { linkMoveId: pairId }, data: { linkMoveId: null } });
        await tx.move.delete({ where: { id: pairId } });
      }
      return tx.move.delete({ where: { id: moveId } });
    });

    await audit(userId, 'SUPPRESSION', 'movement', String(moveId), {
      moveId,
      type: move.type.code,
      articleId: move.articleId,
      articleCode: move.article?.code,
      lot: move.lot?.lotNumber ?? null,
      quantity: move.quantity,
      sens: move.sens,
      depot: move.depot?.label ?? null,
      location: move.location?.label ?? null,
      movementDate: move.movementDate,
      observation: move.observation,
      ...(pairId != null ? { pairMoveId: pairId } : {}),
    });
    return deleted;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
      throw conflict(
        'Suppression impossible : ce mouvement est lié à un prêt, un retour de prêt ou une ligne d’inventaire.',
      );
    }
    throw e;
  }
}
