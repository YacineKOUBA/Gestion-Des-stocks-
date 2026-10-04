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
  type Amputation,
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
   * F3 : libelle du geste pour le message d'empietement. Une annulation d'entree
   * retire du stock sans que l'utilisateur ait sorti quoi que ce soit ; sans ce
   * libelle, le message lui dirait « 200 a sortir » alors qu'il annule.
   */
  geste?: string | null;
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
 * D20, decision 4 : c'est aussi la porte de `reactivateMovement`. Reactiver un
 * mouvement annule le remet dans le calcul du stock, donc en retire a nouveau.
 * Sans ce controle, une promesse ACTIF pouvait etre amputee sans confirmation et
 * l'ecran Etat de stock affichait « deja reserve » au-dela de 100 %.
 *
 * Le controle est volontairement place APRES les tests de disponibilite : inutile
 * de demander a l'utilisateur d'accepter une amputation sur une operation qui de
 * toute facon echouerait.
 *
 * Renvoie les amputations reellement consenties (liste vide si l'ecriture est
 * libre) : l'appelant les joint a sa propre trace d'audit.
 */
async function assertNoReservedOverlap(
  input: MoveInput,
  sens: number,
  stockCellule: Prisma.Decimal | null,
  userId: number,
  db: Db,
): Promise<Amputation[]> {
  if (sens >= 0 || stockCellule === null) return [];

  const cell = {
    articleId: input.articleId,
    lotId: input.lotId ?? null,
    depotId: input.depotId,
    locationId: input.locationId ?? null,
  };

  const conflit = await detectOverlap(
    {
      cell,
      stockCellule,
      quantite: dec(input.quantity),
      operation: input.type,
      ...(input.geste ? { geste: input.geste } : {}),
    },
    db,
  );
  if (!conflit) return [];

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

  // m1 : la trace doit porter l'IDENTifiant de ce qu'elle decrit. Une confirmation
  // peut amputer plusieurs parties a la fois — une cellule porte les promesses de
  // plusieurs reservations — et une trace par partie est donc la seule qui ne
  // mente pas : `entity_id` devient enfin un `reservation_allocation.id`, et non plus
  // l'`articleId`, qui ne designait aucune ligne de la table. Le contexte du conflit
  // (Y, X, Z, overlap, formule, operation) est repris sur chaque trace pour qu'elle
  // reste lisible isolement, avec la part reellement prelevee et sa reservation.
  for (const a of amputations) {
    await audit(userId, 'VALIDATION', 'reservation_allocation', a.allocationId, {
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
      reservationId: a.reservationId,
      reservationRef: a.reservationRef,
      quantitePrelevee: a.quantite,
      ...(input.geste ? { geste: input.geste } : {}),
    });
  }

  return amputations;
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

/**
 * Annule un mouvement et, pour un TRANSFERT, sa moitie liee.
 *
 * F3 : l'annulation retire du stock exactement comme la creation — dans le cas
 * inverse. Annuler une ENTREE (`sens +1`) fait DISPARAITRE ce qu'elle avait
 * apporte, annuler la moitie SORTIE d'un TRANSFERT reprend la marchandise a sa
 * source : dans les deux cas la cellule perd de la quantite, donc une promesse
 * ACTIF peut etre amputee sans que personne ne l'ait demande. Symetrique de la
 * reactivation (F1, decision D20 n° 4), qui avait ete traitee et pas l'annulation.
 *
 * Le controle est donc le meme, avec la meme formule `X + Z - Y`, le meme refus
 * 409, le meme jeton signe et la meme trace d'audit des amputations consenties.
 * Seule difference : ici Y est le stock AVANT annulation et Z la quantite que
 * l'annulation va retirer, ce qui donne la meme inequation
 * `X + Z <= Y` — l'annulation est donc traitee comme une sortie de meme
 * quantite, ce qui est exact.
 *
 * Une ANNULATION qui rend du stock (annuler une SORTIE) ne peut pas morde une
 * promesse : elle en libere. `assertNoReservedOverlap` ne s'y declenche donc pas,
 * et rien n'a besoin d'etre change.
 *
 * `operation` est le code du mouvement annule, alors qu'il s'agit d'un retrait :
 * le message dit « annulation de l'ENTREE » plutot que « SORTIE », ce qui est plus
 * honnete pour l'utilisateur. La formule, elle, reste `X + Z - Y`.
 */
export async function cancelMovement(
  moveId: bigint,
  userId: number,
  confirmToken?: string | null,
) {
  const move = await prisma.move.findUnique({
    where: { id: moveId },
    include: { type: true },
  });
  if (!move) throw notFound('Mouvement introuvable');
  if (move.status === 'ANNULE') throw badRequest('Mouvement déjà annulé');

  const paire =
    move.type.code === MoveTypeCode.TRANSFERT
      ? await prisma.move.findFirst({ where: { linkMoveId: moveId }, include: { type: true } })
      : null;

  // Moitie dont l'annulation RETIRE du stock. Le stock d'une cellule est la somme
  // des `quantite x sens` des mouvements ACTIFS : retirer une ENTREE (`sens +1`)
  // fait BAISSER la cellule, alors que retirer une SORTIE (`sens -1`) la fait
  // monter. La moitie a surveiller est donc l'ENTREE, et pour un TRANSFERT c'est
  // sa moitie destination — l'inverse exact de la reactivation, ou l'on
  // re-integrait la SORTIE.
  const retirant = [move, paire].find((m) => m != null && m.sens > 0) ?? null;

  let amputations: Amputation[] = [];

  const updated = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "articles" WHERE id = ${move.articleId} FOR UPDATE`;

    if (retirant) {
      // Y = stock de la cellule tel qu'il est, l'annulation n'ayant pas encore eu
      // lieu : c'est exactement la valeur contre laquelle la formule s'applique.
      const stockCellule = await availableStockDeci(
        {
          articleId: retirant.articleId,
          lotId: retirant.lotId,
          depotId: retirant.depotId,
          locationId: retirant.locationId,
        },
        tx,
      );

      // La disponibilite d'ABORD, comme dans `createMovementTx` : une annulation ne
      // peut pas rendre une cellule negative. Ce controle ne se confond pas avec
      // l'empietement D20 — celui-la dit « tu prends sur une promesse », celui-ci dit
      // « il n'y a plus de marchandise » — et il ne se contourne pas par une
      // confirmation. La difference est de nature : le manque d'une SORTIE est toujours
      // borne par une promesse reelle que l'amputation rend honnete ; ici il n'y a
      // rien a amputer, et confirmer consignerait un stock negatif que ni l'ecran Etat
      // de stock ni la valorisation ne savent representer. Le refus est donc sans issue.
      //
      // Le calcul est direct : le stock de la cellule inclut encore cette ENTREE, donc
      // `stock - quantite >= 0` equivaut a `stock >= quantite`.
      const apresAnnulation = stockCellule.sub(dec(retirant.quantity));
      if (apresAnnulation.lessThan(0)) {
        throw badRequest(
          `Annulation impossible : la marchandise entrée par ce mouvement a déjà été consommée depuis. ` +
            `L'annulation ferait passer le stock du dépôt ${retirant.depotId}` +
            `${retirant.lotId != null ? `, lot ${retirant.lotId}` : ''} de ${toNumber(stockCellule, 3)} à ` +
            `${toNumber(apresAnnulation, 3)} unité(s). ` +
            `Si la consommation est une erreur, réactivez d'abord le mouvement correspondant ; ` +
            `sinon, consignez-la en PERTE ou en AJUSTEMENT d'inventaire. ` +
            `Aucune modification n'a été enregistrée.`,
        );
      }

      amputations = await assertNoReservedOverlap(
        {
          type: retirant.type.code,
          articleId: retirant.articleId,
          quantity: toNumber(retirant.quantity, 3),
          movementDate: retirant.movementDate,
          depotId: retirant.depotId,
          locationId: retirant.locationId,
          lotId: retirant.lotId,
          confirmToken: confirmToken ?? null,
          geste: 'à retirer par cette annulation',
        },
        // `sens` negatif : du point de vue de la cellule, l'annulation de cette ENTREE
        // est exactement une SORTIE de la meme quantite. C'est ce que la formule
        // `X + Z - Y` doit recevoir, et `assertNoReservedOverlap` ne s'interesse qu'aux
        // retraits — sans ce signe, il ne ferait rien et le controle serait silencieusement
        // inoperant.
        -1,
        stockCellule,
        userId,
        tx,
      );
    }

    const updatedMove = await tx.move.update({
      where: { id: moveId },
      data: { status: 'ANNULE', canceledBy: userId, canceledAt: new Date() },
    });
    if (move.type.code === MoveTypeCode.TRANSFERT) {
      await tx.move.updateMany({
        where: { linkMoveId: moveId, status: 'ACTIF' },
        data: { status: 'ANNULE', canceledBy: userId, canceledAt: new Date() },
      });
    }
    // m3 : la reponse renvoyait l'instantane relu AVANT la mise a jour, donc
    // l'ecran reaffichait « ACTIF » juste apres avoir annule. On renvoie la ligne
    // ecrite, avec son statut et sa date d'annulation.
    return updatedMove;
  });
  await audit(userId, 'ANNULATION', 'movement', String(moveId), {
    moveId,
    type: move.type.code,
    articleId: move.articleId,
    quantity: move.quantity,
    ...(amputations.length ? { amputations } : {}),
  });
  return updated;
}

/**
 * Reactive un mouvement annule (retour au statut ACTIF).
 * Le stock etant recalcule a partir des mouvements ACTIFS, la reactivation
 * modifie le stock disponible : on re-valide donc la disponibilite du stock
 * (hors mouvement reactivé) pour les mouvements qui diminuent le stock,
 * et un TRANSFERT reactive aussi sa moitié liée (entree/sortie).
 *
 * D20, decision 4 : la reactivation retire a nouveau du stock, elle repasse donc
 * par le point de controle d'empietement des reservations ACTIF, exactement comme
 * la creation (meme formule `X + Z − Y`, meme refus 409, meme jeton signe, meme
 * trace). Deux corrections en decoulent :
 *   - le controle porte sur la moitie RETIRANTE du couple. Un TRANSFERT est deux
 *     lignes liees (SORTIE source + ENTREE destination) et la demande porte sur
 *     l'une ou l'autre : reactiver via la moitie ENTREE reactivait silencieusement
 *     la SORTIE, sans meme revalider la disponibilite ;
 *   - un accord utilisateur preleve l'overlap sur les promesses concernees ; ces
 *     amputations sont jointes a la trace de reactivation.
 *
 * Le mouvement a reactiver est encore ANNULE, donc deja exclu du stock : la
 * re-validation mesure donc l'etat courant, comme si la sortie n'avait jamais eu
 * lieu.
 */
export async function reactivateMovement(
  moveId: bigint,
  userId: number,
  confirmToken?: string | null,
) {
  const move = await prisma.move.findUnique({
    where: { id: moveId },
    include: { type: true },
  });
  if (!move) throw notFound('Mouvement introuvable');
  if (move.status !== 'ANNULE') throw badRequest('Mouvement déjà actif');

  const paire =
    move.type.code === MoveTypeCode.TRANSFERT
      ? await prisma.move.findFirst({
          where: { linkMoveId: moveId },
          include: { type: true },
        })
      : null;

  // Moitie qui retire reellement du stock. Pour un TRANSFERT c'est toujours la
  // SORTIE, que la demande porte sur l'une ou l'autre des deux lignes.
  const retirant = [move, paire].find((m) => m != null && m.sens < 0) ?? null;

  let amputations: Amputation[] = [];

  const updated = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "articles" WHERE id = ${move.articleId} FOR UPDATE`;

    // Re-validation de disponibilite ET controle d'empietement D20 : stock ACTUEL
    // hors mouvement(s) réactive(s).
    if (retirant) {
      const excludeIds = paire ? [move.id, paire.id] : [move.id];
      const stockCellule = await availableStockDeci(
        {
          articleId: retirant.articleId,
          lotId: retirant.lotId,
          depotId: retirant.depotId,
          locationId: retirant.locationId,
          excludeIds,
        },
        tx,
      );
      if (stockCellule.lessThan(dec(retirant.quantity))) {
        throw badRequest(
          `Stock insuffisant pour réactiver ce mouvement (disponible : ${toNumber(stockCellule)})`,
        );
      }

      amputations = await assertNoReservedOverlap(
        {
          type: retirant.type.code,
          articleId: retirant.articleId,
          quantity: toNumber(retirant.quantity),
          movementDate: retirant.movementDate,
          depotId: retirant.depotId,
          locationId: retirant.locationId,
          lotId: retirant.lotId,
          confirmToken: confirmToken ?? null,
        },
        retirant.sens,
        stockCellule,
        userId,
        tx,
      );
    }

    const updatedMove = await tx.move.update({
      where: { id: moveId },
      data: { status: 'ACTIF', canceledBy: null, canceledAt: null },
    });

    if (paire) {
      await tx.move.updateMany({
        where: { id: paire.id, status: 'ANNULE' },
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
    ...(amputations.length ? { amputations } : {}),
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
