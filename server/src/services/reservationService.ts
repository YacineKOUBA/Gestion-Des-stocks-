import { prisma } from '../prisma';
import { MoveTypeCode, Prisma, type ReservationStatus } from '@prisma/client';
import { badRequest, notFound } from '../utils/apiError';
import { audit } from '../utils/audit';
import { dec, toNumber } from '../utils/decimal';
import {
  activeAllocations,
  cellKey,
  computePlafond,
  plafondPct,
  reservedByArticle,
  reservedByCell,
} from './reservationStock';

/**
 * D20 - La reservation est une PROMESSE, pas une sortie de stock.
 *
 * Ce que le directeur a redonne, et qui change tout le module :
 *
 *   1. plafond de 15 % de la quantite globale de chaque produit (cumul des
 *      reservations ACTIF) ;
 *
 * Point 1 remplace par D21 : le plafond porte sur le cumul des promesses d'un
 * ACTEUR sur un produit, plafonne a 15 % du stock libre de ce produit. La regle
 * globale disparait (deux acteurs concurrents peuvent donc chacun atteindre leur
 * quota) et l'acteur valide par la direction generale en est dispense. Voir
 * `computePlafond`.
 *   2. FEFO a la creation : les lots sont figes dans `reservation_allocations`,
 *      lot par lot, dans l'ordre de peremption le plus proche. AUCUN mouvement
 *      n'est ecrit — le stock physique ne bouge pas ;
 *   3. tant qu'elle n'est pas validee, la reservation est visible dans l'etat de
 *      stock (quantite reservee, pourcentage, stock libre) et toute sortie qui
 *      risque de mordre dans un lot reserve declenche une confirmation ;
 *   4. la validation, seule, cree la vraie sortie de stock et le journal des
 *      mouvements.
 *
 * Consequence sur le reste du systeme : `computeThresholds` et la consommation
 * mensuelle ne sont plus polluees par de fausses sorties. Une reservation ne
 * pese plus sur les seuils avant d'etre reellement honoree.
 */

type Db = Prisma.TransactionClient;

export interface ReservationInput {
  partnerId: number;
  staffLabel: string;
  staffId?: number | null;
  startDate: Date;
  endDate: Date;
  observation?: string | null;
  lines: { articleId: number; quantity: number }[];
}

/** Une cellule de stock (article + lot + depot + emplacement) et ses trois totaux. */
export interface AvailabilityRow {
  lotId: number | null;
  lotNumber: string | null;
  expiryDate: Date | null;
  depotId: number;
  depotLabel: string;
  locationId: number | null;
  locationLabel: string | null;
  /** Stock physique de la cellule (Y). */
  quantity: number;
  /** Quantite deja promise sur cette cellule (X). */
  reserve: number;
  /** Stock libre : ce que le FEFO peut reellement prendre (Y - X). */
  libre: number;
}

/**
 * F2 : `lignes` et les totaux n'ont pas le meme perimetre.
 *
 * `lignes` = cellules de stock libre strictement positif, triees FEFO. Sert de base
 * au FEFO, au controle de disponibilite et a l'apercu affiche au directeur.
 *
 * `stockTotal` / `dejaReserve` / `libreTotal` = sommes sur TOUTES les cellules de
 * l'article, y compris les cellules saturees. Servent de base au plafond (D21) et
 * aux colonnes de l'ecran Etat de stock. Les calculer sur `lignes` tronquerait la
 * base et elargirait le plafond : c'est exactement F2.
 */
export interface AvailabilityRows {
  lignes: AvailabilityRow[];
  stockTotal: Prisma.Decimal;
  dejaReserve: Prisma.Decimal;
  /** Stock libre total, toutes cellules confondues : base du plafond D21. */
  libreTotal: Prisma.Decimal;
}

function todayStart(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function dayStart(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/**
 * Stock d'un article, detaille par cellule et CLASSE par ORDRE DE PEREMPTION
 * CROISSANTE (FEFO : le lot qui perime le plus tot part en premier).
 *
 * La colonne `libre` est ce que la reservation peut prendre : le directeur a
 * tranche que le FEFO ignore le deja reserve (decision D20 n° 2), sans quoi deux
 * reservations successives prometraient le meme lot.
 *
 * Reservee a un seul article a la fois : aucune quantite d'un autre article (donc
 * d'une autre unite) n'entre dans le calcul. Le lot "null" correspond aux
 * articles non lot-traces ; ces lignes passent apres les lots dates (ils n'ont pas
 * de peremption).
 *
 * F2 : `lignes` et les deux totaux ne portent pas sur le meme perimetre, et ne
 * doivent jamais etre confondus :
 *
 *   - `lignes` ne contient que les cellules de stock libre strictement positif.
 *     C'est la base du FEFO : une cellule saturee ne peut rien offrir, elle n'a donc
 *     pas a y figurer, et son `libre` negatif ne doit surtout pas etre somme ;
 *   - `stockTotal` et `dejaReserve` portent sur TOUTES les cellules. C'est la base
 *     du plafond : une cellule saturee porte physiquement du stock ET porte une
 *     promesse, les deux doivent donc compter.
 *
 * Avant F2, les totaux etaient calcules sur `lignes`, donc sur la base tronquee. Une
 * cellule saturee etait alors doublement benie : son stock physique et sa promesse
 * disparaissaient du plafond, qui se retrouvait plus large que la regle. Le filtre
 * ne doit pas etre applique avant la sommation.
 */
async function availabilityRows(
  articleId: number,
  db: Db,
  opts: { excludeReservationId?: bigint } = {},
): Promise<AvailabilityRows> {
  const article = await db.article.findUnique({
    where: { id: articleId },
    select: { isLotTracked: true },
  });
  if (!article) throw notFound('Article introuvable');

  // Article lot-trace : on interroge tous ses lots. Sinon une seule "ligne" sans lot.
  let lots: { id: number; lotNumber: string; expiryDate: Date | null }[] = [];
  if (article.isLotTracked) {
    lots = await db.lot.findMany({
      where: { articleId },
      select: { id: true, lotNumber: true, expiryDate: true },
    });
  }
  const lotById = new Map(lots.map((l) => [l.id, l]));
  const lotIds = lots.map((l) => l.id);
  const lotFilter: Prisma.MoveWhereInput = article.isLotTracked
    ? { lotId: { in: lotIds } }
    : { lotId: null };

  // Tous depots et emplacements confondus : la reservation choisit elle-meme les
  // lots (FEFO), le client n'a pas a designer de depot dans le formulaire.
  const moves = await db.move.findMany({
    where: { articleId, status: 'ACTIF', ...lotFilter },
    select: {
      lotId: true,
      depotId: true,
      depot: { select: { label: true } },
      locationId: true,
      location: { select: { label: true } },
      quantity: true,
      sens: true,
    },
  });

  const map = new Map<string, AvailabilityRow>();
  for (const m of moves) {
    const key = `${m.lotId ?? ''}|${m.depotId}|${m.locationId ?? ''}`;
    const lot = m.lotId != null ? lotById.get(m.lotId) : undefined;
    const cur = map.get(key) ?? {
      lotId: m.lotId,
      lotNumber: lot?.lotNumber ?? null,
      expiryDate: lot?.expiryDate ?? null,
      depotId: m.depotId,
      depotLabel: m.depot.label,
      locationId: m.locationId,
      locationLabel: m.location?.label ?? null,
      quantity: 0,
      reserve: 0,
      libre: 0,
    };
    cur.quantity = cur.quantity + toNumber(dec(m.quantity).mul(m.sens), 3);
    map.set(key, cur);
  }

  // Promesses en cours sur les memes cellules, reservation en cours de validation
  // exclue lorsqu'on valide (ses propres parts ne doivent pas se bloquer
  // elles-memes).
  const reserved = reservedByCell(
    await activeAllocations({ articleIds: [articleId], excludeReservationId: opts.excludeReservationId }, db),
  );
  for (const row of map.values()) {
    const key = cellKey({
      articleId,
      lotId: row.lotId,
      depotId: row.depotId,
      locationId: row.locationId,
    });
    row.reserve = toNumber(reserved.get(key) ?? dec(0), 3);
    row.libre = toNumber(dec(row.quantity).sub(dec(row.reserve)), 3);
  }

  // F2 : totaux du PLAFOND, calcules sur toutes les cellules, AVANT tout filtre.
  // Ce sont eux qui doivent porter la base de la regle des 15 %.
  const toutesCellules = [...map.values()];
  const stockTotal = toutesCellules.reduce((a, r) => a.add(dec(r.quantity)), new Prisma.Decimal(0));
  const dejaReserve = toutesCellules.reduce((a, r) => a.add(dec(r.reserve)), new Prisma.Decimal(0));
  // F2 applique a la regle D21 : la base du plafond est le stock libre, et elle
  // se calcule sur TOUTES les cellules. Une cellule de libre exactement nul
  // contribue 0 et ne change donc rien ; une cellule negative, si elle pouvait
  // exister, compterait au lieu de disparaitre. La somme ne doit pas dependre du
  // filtre qui definit la base du FEFO.
  const libreTotal = toutesCellules.reduce((a, r) => a.add(dec(r.libre)), new Prisma.Decimal(0));

  return {
    // Base du FEFO : cellules encore libres, dans l'ordre de peremption.
    lignes: toutesCellules
      .filter((r) => r.libre > 0)
      .sort((a, b) => {
        // FEFO : peremption la plus proche d'abord ; les lots sans date en dernier.
        if (a.lotId == null && b.lotId != null) return 1;
        if (a.lotId != null && b.lotId == null) return -1;
        if (a.expiryDate && b.expiryDate && a.expiryDate.getTime() !== b.expiryDate.getTime()) {
          return a.expiryDate.getTime() - b.expiryDate.getTime();
        }
        if ((a.expiryDate ? 0 : 1) !== (b.expiryDate ? 0 : 1)) return a.expiryDate ? -1 : 1;
        if (a.lotNumber && b.lotNumber && a.lotNumber !== b.lotNumber) {
          return a.lotNumber.localeCompare(b.lotNumber);
        }
        return a.depotId - b.depotId || (a.locationId ?? 0) - (b.locationId ?? 0);
      }),
    stockTotal,
    dejaReserve,
    libreTotal,
  };
}

/**
 * Disponibilite d'un article pour le formulaire, pour un acteur donne.
 *
 * Renvoie deux choses qu'il ne faut pas confondre :
 * - le stock libre, base du FEFO et des colonnes de l'ecran Etat de stock ;
 * - le plafond de l'ACTEUR : son cumul deja promis sur cet article, et ce qu'il
 *   peut encore y ajouter. C'est cette derniere valeur qui doit plafonner le champ
 *   quantite cote client.
 *
 * `partnerId` absent, aucun cumul n'est imputable a un acteur et le plafond est
 * calcule sur un cumul nul : l'appelant voit alors le plafond theorique du produit,
 * pas celui d'un client precis.
 */
export async function availability(articleId: number, partnerId?: number) {
  const { lignes, stockTotal, dejaReserve, libreTotal } = await availabilityRows(
    articleId,
    prisma as unknown as Db,
  );
  const total = lignes.reduce((a, r) => a + r.libre, 0);
  const pct = await plafondPct();
  const exempt = partnerId != null ? await isPlafondExempt(partnerId) : false;
  const cumulActeur =
    partnerId == null
      ? new Prisma.Decimal(0)
      : reservedByArticle(
          await activeAllocations({ articleIds: [articleId], partnerId }, prisma as unknown as Db),
        ).get(articleId) ?? new Prisma.Decimal(0);
  const etat = computePlafond({ base: libreTotal, cumulActuel: cumulActeur, demande: dec(0), pct });
  return {
    articleId,
    /** Stock libre : base du FEFO. */
    total: toNumber(dec(total), 3),
    /** Stock physique, toutes cellules confondues (F2). */
    stockTotal: toNumber(stockTotal, 3),
    /** Promesses ACTIF de tous les acteurs, toutes cellules confondues (F2). */
    reserve: toNumber(dejaReserve, 3),
    /** Acteur valide par la direction generale : le plafond ne s'applique pas. */
    exempt,
    /** Ce que cet acteur a deja promis sur cet article (regle D21). */
    cumulActeur: etat.cumulActuel,
    /** Plafond de cet acteur : pct du stock libre du produit. */
    plafond: etat.plafond,
    pctPlafond: pct,
    /**
     * Ce que cet acteur peut encore ajouter sur cet article. `null` quand il est
     * exempt : sans plafond, il n'y a pas de reste a afficher, et un `0` se lirait
     * comme un refus alors que la saisie est libre.
     */
    // Plafond et cumul sont deja arrondis : leur difference peut reintroduire une
    // erreur de virgule flottante (52.849999999999994), on la referme ici.
    plafondRestant: exempt
      ? null
      : Math.max(0, Number((etat.plafond - etat.cumulActuel).toFixed(3))),
    lignes: lignes.map((r) => ({
      ...r,
      expiryDate: r.expiryDate?.toISOString().slice(0, 10) ?? null,
    })),
  };
}

/**
 * D21 : l'acteur est-il valide par la direction generale, donc dispense du plafond
 * cumulatif ? Cette dispense ne porte que sur la QUANTITE : le stock libre, le
 * FEFO et le controle de disponibilite s'appliquent toujours.
 */
async function isPlafondExempt(partnerId: number, db: Db = prisma as unknown as Db): Promise<boolean> {
  const row = await db.partner.findUnique({
    where: { id: partnerId },
    select: { plafondExempt: true },
  });
  if (!row) throw notFound('Acteur introuvable');
  return row.plafondExempt;
}

function assertPeriod(startDate: Date, endDate: Date) {
  if (endDate.getTime() < startDate.getTime()) {
    throw badRequest('La date de fin doit être postérieure ou égale à la date de début');
  }
}

function mergeLines(lines: { articleId: number; quantity: number }[]) {
  const byArticle = new Map<number, Prisma.Decimal>();
  for (const l of lines) {
    if (!Number.isFinite(l.quantity) || l.quantity <= 0) {
      throw badRequest('Chaque ligne doit avoir une quantité supérieure à 0');
    }
    const cur = byArticle.get(l.articleId) ?? new Prisma.Decimal(0);
    byArticle.set(l.articleId, cur.add(dec(l.quantity)));
  }
  return [...byArticle.entries()].map(([articleId, quantity]) => ({ articleId, quantity }));
}

async function nextRef(tx: Db, year: number): Promise<string> {
  const count = await tx.reservation.count({
    where: { createdAt: { gte: new Date(Date.UTC(year, 0, 1)) } },
  });
  return `RSV-${year}-${String(count + 1).padStart(4, '0')}`;
}

/**
 * Cree une reservation : AUCUN mouvement n'est ecrit, le stock physique ne bouge
 * pas. Ce qui est fige, ce sont les lots et les quantites promises
 * (`reservation_allocations`), choisis par FEFO sur le stock LIBRE.
 *
 * Deux controles bloquants, dans l'ordre :
 *   - le stock libre doit couvrir la ligne demandee ;
 *   - le CUMUL des promesses de cet acteur sur ce produit ne doit pas depasser le
 *     plafond (15 % du stock libre, parametre `RESERVATION_PLAFOND_PCT`, regle D21).
 *     Un acteur dispense de ce plafond par la direction generale en est exempt.
 */
export async function createReservation(input: ReservationInput, userId: number) {
  if (!input.lines.length) throw badRequest('Ajoutez au moins un article à réserver');
  assertPeriod(dayStart(input.startDate), dayStart(input.endDate));

  // Le personnel est un texte libre : il n'a pas obligation d'etre un utilisateur. On
  // conserve le lien avec un utilisateur uniquement si le texte saisi en correspond un
  // (recherche insensible a la casse sur le nom affiche et l'identifiant).
  const staffLabel = input.staffLabel.trim();
  if (!staffLabel) throw badRequest('Indiquez le personnel interne concerné par la réservation');

  const [partner, staff] = await Promise.all([
    prisma.partner.findUnique({
      where: { id: input.partnerId },
      select: { id: true, isActive: true, name: true },
    }),
    prisma.user.findFirst({
      where: {
        isActive: true,
        OR: [
          { displayName: { equals: staffLabel, mode: 'insensitive' } },
          { login: { equals: staffLabel, mode: 'insensitive' } },
        ],
      },
      select: { id: true, isActive: true, displayName: true, login: true },
    }),
  ]);
  if (!partner) throw notFound('Acteur introuvable');
  if (!partner.isActive) throw badRequest('Cet acteur est désactivé');
  // Nomme l'acteur dans le refus de plafond : un refus « par produit » ne disait
  // pas a l'utilisateur de QUI il s'agissait, alors que la regle est maintenant
  // propre a chaque acteur.
  const partnerLabel = partner.name;
  // Un staffId explicite doit designer un utilisateur actif ; sinon le texte libre suffit.
  let staffId = staff?.id ?? null;
  if (input.staffId != null) {
    const cible = await prisma.user.findUnique({
      where: { id: input.staffId },
      select: { id: true, isActive: true },
    });
    if (!cible) throw notFound('Personnel introuvable');
    if (!cible.isActive) throw badRequest('Ce personnel est désactivé');
    staffId = cible.id;
  }

  const lines = mergeLines(input.lines);
  // Ordre croissant des identifiants : verrouille toujours les memes articles dans le
  // meme ordre, ce qui evite les interblocages entre reservations concurrentes.
  const articleIds = lines.map((l) => l.articleId).sort((a, b) => a - b);

  // Devise portee par chaque article, reportee sur les SORTIES creees a la validation
  // (la reservation ne cree aucun mouvement, elle n'a donc rien a porter).
  const currencyByArticle = new Map<number, string>();
  for (const a of await prisma.article.findMany({
    where: { id: { in: articleIds } },
    select: { id: true, currency: true },
  })) {
    currencyByArticle.set(a.id, a.currency);
  }

  const runTx = () =>
    prisma.$transaction(async (tx) => {
      for (const id of articleIds) {
        await tx.$queryRaw`SELECT id FROM "articles" WHERE id = ${id} FOR UPDATE`;
      }
      // Serialise la numerotation des references entre transactions concurrentes
      // ($executeRaw : la fonction renvoie void, illisible par $queryRaw).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(728364112)`;

      const pct = await plafondPct(tx);
      // D21 : la dispense se lit UNE FOIS pour toute la reservation, avant toute
      // ecriture, et non ligne par ligne.
      const exempt = await isPlafondExempt(input.partnerId, tx);
      const year = input.startDate.getUTCFullYear();
      const reservation = await tx.reservation.create({
        data: {
          ref: await nextRef(tx, year),
          partnerId: input.partnerId,
          staffLabel,
          staffId,
          startDate: dayStart(input.startDate),
          endDate: dayStart(input.endDate),
          observation: input.observation ?? null,
          createdBy: userId,
        },
      });

      for (const line of lines) {
        // F2 : les totaux portent sur TOUTES les cellules, le controle de
        // disponibilite sur le sous-ensemble de libre > 0. Invertir l'ordre des deux
        // elargirait le plafond sans que la disponibilite bouge.
        const { lignes, dejaReserve, libreTotal } = await availabilityRows(line.articleId, tx);
        const libre = lignes.reduce<Prisma.Decimal>((a, r) => a.add(dec(r.libre)), new Prisma.Decimal(0));

        const art = await tx.article.findUnique({
          where: { id: line.articleId },
          select: { code: true, designation: true },
        });

        if (libre.lessThan(line.quantity)) {
          throw badRequest(
            `Stock insuffisant pour l'article ${art?.code ?? line.articleId} - ${art?.designation ?? ''} ` +
              `(libre : ${toNumber(libre, 3)}${dejaReserve.greaterThan(0) ? `, dont ${toNumber(dejaReserve, 3)} déjà réservé` : ''})`,
          );
        }

        // D21 : plafond sur le CUMUL des promesses de CET acteur sur ce produit.
        // Un acteur peut donc repartir son quota sur plusieurs reservations, mais
        // pas le depasser. Verifie apres la disponibilite : inutile de reprocher un
        // plafond a quelqu'un qui n'a pas assez de stock libre.
        if (!exempt) {
          const cumulActeur =
            reservedByArticle(
              await activeAllocations(
                { articleIds: [line.articleId], partnerId: input.partnerId },
                tx,
              ),
            ).get(line.articleId) ?? new Prisma.Decimal(0);
          const etat = computePlafond({
            base: libreTotal,
            cumulActuel: cumulActeur,
            demande: line.quantity,
            pct,
          });
          if (etat.depasse) {
            throw badRequest(
              `Plafond de réservation dépassé pour ${partnerLabel} sur l'article ${art?.code ?? line.articleId} - ${art?.designation ?? ''} : ` +
                `maximum ${etat.pct} % du stock libre, soit ${etat.plafond} ` +
                `(stock libre ${etat.base}, déjà réservé par cet acteur ${etat.cumulActuel}, demande ${etat.demande}, cumul ${etat.cumulApresDemande}).`,
              { plafond: etat },
            );
          }
        }

        const reservationLine = await tx.reservationLine.create({
          data: {
            reservationId: reservation.id,
            articleId: line.articleId,
            quantity: toNumber(line.quantity, 3),
          },
        });

        // FEFO : on consomme les lignes deja triees par peremption croissante, sur
        // leur stock LIBRE. Ce qui est ecrit ici est une promesse, pas une sortie.
        let reste = line.quantity;
        for (const row of lignes) {
          if (reste.lte(0)) break;
          const part = dec(row.libre).greaterThan(reste) ? reste : dec(row.libre);
          await tx.reservationAllocation.create({
            data: {
              reservationId: reservation.id,
              reservationLineId: reservationLine.id,
              articleId: line.articleId,
              lotId: row.lotId,
              depotId: row.depotId,
              locationId: row.locationId,
              quantity: toNumber(part, 3),
            },
          });
          reste = reste.sub(part);
        }
      }

      return reservation;
    });

  // Une collision de reference ne peut pas etre rejouee dans la transaction qui l'a
  // subie : PostgreSQL l'a annulee. On rejoue donc la transaction entiere.
  let result: Awaited<ReturnType<typeof runTx>> | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      result = await runTx();
      break;
    } catch (e) {
      const collision = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
      if (!collision || attempt === 4) throw e;
    }
  }
  if (!result) throw badRequest('Impossible de générer la référence de la réservation');

  await audit(userId, 'CREATION', 'reservation', String(result.id), {
    ref: result.ref,
    partnerId: input.partnerId,
    staffLabel,
    staffId,
    startDate: result.startDate,
    endDate: result.endDate,
    lines,
    // La reservation ne cree aucun mouvement : le tracer evite qu'un tiers suppose
    // qu'un stock a bouge alors que la promesse est virtuelle.
    mouvementsCrees: 0,
  });
  return getReservation(result.id);
}

const includeFull = {
  partner: { select: { id: true, name: true } },
  staff: { select: { id: true, displayName: true, login: true } },
  creator: { select: { id: true, displayName: true, login: true } },
  closer: { select: { id: true, displayName: true } },
  lines: {
    orderBy: { id: 'asc' },
    include: {
      article: { select: { id: true, code: true, designation: true, unit: { select: { code: true } } } },
    },
  },
  // D20 : le detail FEFO fige. C'est la promesse, elle reste consultable apres
  // validation (elle explique quels lots avaient ete retenus).
  allocations: {
    orderBy: { id: 'asc' },
    select: {
      id: true,
      articleId: true,
      lotId: true,
      depotId: true,
      locationId: true,
      quantity: true,
      takenQuantity: true,
      depot: { select: { label: true } },
      location: { select: { label: true } },
      lot: { select: { lotNumber: true, expiryDate: true } },
    },
  },
  // Les SORTIES reelles creees a la validation (vide avant).
  moves: {
    orderBy: [{ lot: { expiryDate: 'asc' } }, { id: 'asc' }],
    select: {
      id: true,
      lotId: true,
      articleId: true,
      quantity: true,
      sens: true,
      status: true,
      article: { select: { unit: { select: { code: true, label: true } } } },
      depot: { select: { label: true } },
      location: { select: { label: true } },
      lot: { select: { lotNumber: true, expiryDate: true } },
    },
  },
} satisfies Prisma.ReservationInclude;

function serialize(rows: Prisma.ReservationGetPayload<{ include: typeof includeFull }>[]) {
  return rows.map((r) => ({
    id: String(r.id),
    ref: r.ref,
    partner: r.partner,
    staff: r.staff,
    staffLabel: r.staffLabel,
    creator: r.creator,
    closer: r.closer,
    startDate: r.startDate.toISOString().slice(0, 10),
    endDate: r.endDate.toISOString().slice(0, 10),
    status: r.status,
    observation: r.observation,
    createdAt: r.createdAt.toISOString(),
    closedAt: r.closedAt?.toISOString() ?? null,
    closeReason: r.closeReason,
    lines: r.lines.map((l) => ({
      id: String(l.id),
      articleId: l.articleId,
      code: l.article.code,
      designation: l.article.designation,
      unit: l.article.unit?.code ?? null,
      quantity: toNumber(l.quantity, 3),
    })),
    allocations: r.allocations.map((a) => ({
      id: String(a.id),
      articleId: a.articleId,
      lotId: a.lotId,
      // Identifiants ET libelles : le libelle est pour l'affichage, l'identifiant
      // pour allowiger une action (controle d'empietement, export) sans refaire
      // un aller-retour serveur.
      depotId: a.depotId,
      locationId: a.locationId,
      lotNumber: a.lot?.lotNumber ?? null,
      expiryDate: a.lot?.expiryDate?.toISOString().slice(0, 10) ?? null,
      quantity: toNumber(a.quantity, 3),
      takenQuantity: toNumber(a.takenQuantity, 3),
      remaining: toNumber(dec(a.quantity).sub(dec(a.takenQuantity)), 3),
      depot: a.depot.label,
      location: a.location?.label ?? null,
    })),
    moves: r.moves.map((m) => ({
      id: String(m.id),
      lotId: m.lotId == null ? null : Number(m.lotId),
      lotNumber: m.lot?.lotNumber ?? null,
      expiryDate: m.lot?.expiryDate?.toISOString().slice(0, 10) ?? null,
      articleId: m.articleId,
      unit: m.article.unit?.code ?? null,
      quantity: toNumber(m.quantity, 3),
      depot: m.depot.label,
      location: m.location?.label ?? null,
      status: m.status,
    })),
  }));
}

/**
 * Cloture par annulation (manuelle ou expiration).
 *
 * D20 : il n'y a plus rien a annuler dans le journal. Une reservation n'a jamais
 * cree de mouvement, et les seules SORTIES qui lui sont rattachees naissent a la
 * validation, donc apres toute annulation. La reservation sort simplement du
 * calcul de "deja reserve", qui ne compte que les reservations ACTIF.
 */
async function closeAsCancelled(
  id: bigint,
  status: 'ANNULE' | 'EXPIRE',
  reason: string,
  userId: number | null,
) {
  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.reservation.findUnique({
      where: { id },
      select: { status: true, ref: true },
    });
    if (!current) throw notFound('Réservation introuvable');
    if (current.status !== 'ACTIF') {
      throw badRequest(`Cette réservation est déjà clôturée (${current.status})`);
    }
    return tx.reservation.update({
      where: { id },
      data: {
        status,
        closedBy: userId,
        closedAt: new Date(),
        closeReason: reason,
      },
    });
  });
  return updated;
}

/** Cas 1 : l'utilisateur annule la reservation. La promesse s'eteint, rien n'a bougé au stock. */
export async function cancelReservation(id: bigint, userId: number) {
  const closed = await closeAsCancelled(id, 'ANNULE', 'MANUEL', userId);
  await audit(userId, 'ANNULATION', 'reservation', String(id), { ref: closed.ref, reason: 'MANUEL' });
  return getReservation(id);
}

/** Stock physique d'une cellule (Y). Sortie de stock : elle passe par les mouvements. */
async function cellStock(
  cell: { articleId: number; lotId: number | null; depotId: number; locationId: number | null },
  db: Db,
): Promise<Prisma.Decimal> {
  const moves = await db.move.findMany({
    where: {
      articleId: cell.articleId,
      status: 'ACTIF',
      depotId: cell.depotId,
      locationId: cell.locationId,
      lotId: cell.lotId,
    },
    select: { quantity: true, sens: true },
  });
  return moves.reduce<Prisma.Decimal>((a, m) => a.add(dec(m.quantity).mul(m.sens)), new Prisma.Decimal(0));
}

/** Une sortie a creer a la validation, avec la raison de son origine. */
interface SortieValidée {
  articleId: number;
  lotId: number | null;
  depotId: number;
  locationId: number | null;
  quantity: Prisma.Decimal;
  /** Cellule promise d'origine si la sortie rejoue le FEFO apres une amputation. */
  depuisAllocation?: bigint;
}

/**
 * Cas 2 : l'utilisateur VALIDE la reservation. C'est le SEUL moment ou le stock
 * bouge : des SORTIES reelles sont creees, une par part promise.
 *
 * Regle 4 du directeur :
 *   - normally, chaque part promise suffit : le reliquat sort du lot fige ;
 *   - si un lot promis a ete ampute par une sortie anterieure autorisee, on le
 *     signale, on sert ce qui reste, puis on rejoue un FEFO sur le stock
 *     ACTUEL pour extraire le manque ;
 *   - si meme ce re-FEFO ne suffit pas, la validation est REFUSEE : la
 *     reservation reste ACTIF et aucun mouvement n'est cree. Mieux vaut une
 *     reservation honoree en retard qu'un stock sorti deux fois.
 *
 * Trace dans le journal d'audit comme une VALIDATION, pour qu'on retrouve d'un
 * coup d'oeil les reservations honorees et leur validateur.
 */
export async function validateReservation(id: bigint, userId: number) {
  const notes: string[] = [];
  const amputations: Array<{ reservationId: string; allocationId: string; lotNumber: string | null; quantite: number }> = [];
  const reconstitutions: Array<{ articleId: number; lotNumber: string | null; quantity: number }> = [];

  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.reservation.findUnique({
      where: { id },
      select: { status: true, ref: true, partnerId: true },
    });
    if (!current) throw notFound('Réservation introuvable');
    if (current.status !== 'ACTIF') {
      throw badRequest(`Cette réservation est déjà clôturée (${current.status})`);
    }

    const sortieId = (await tx.moveType.findUniqueOrThrow({ where: { code: MoveTypeCode.SORTIE } })).id;
    const currencyByArticle = new Map<number, string>();
    for (const a of await tx.article.findMany({
      where: { reservationLines: { some: { reservationId: id } } },
      select: { id: true, currency: true },
    })) {
      currencyByArticle.set(a.id, a.currency);
    }

    const allocations = await tx.reservationAllocation.findMany({
      where: { reservationId: id },
      select: {
        id: true,
        articleId: true,
        lotId: true,
        depotId: true,
        locationId: true,
        quantity: true,
        takenQuantity: true,
        lot: { select: { lotNumber: true } },
      },
      orderBy: { id: 'asc' },
    });

    const sorties: SortieValidée[] = [];

    for (const a of allocations) {
      await tx.$queryRaw`SELECT id FROM "articles" WHERE id = ${a.articleId} FOR UPDATE`;

      const restant = dec(a.quantity).sub(dec(a.takenQuantity));
      const cell = {
        articleId: a.articleId,
        lotId: a.lotId,
        depotId: a.depotId,
        locationId: a.locationId,
      };

      // Note d'information D20 : la part a deja ete amputee par une sortie
      // anterieure autorisee par l'utilisateur.
      if (dec(a.takenQuantity).greaterThan(0)) {
        amputations.push({
          reservationId: String(id),
          allocationId: String(a.id),
          lotNumber: a.lot?.lotNumber ?? null,
          quantite: toNumber(dec(a.takenQuantity), 3),
        });
        const stockApres = await cellStock(cell, tx);
        if (stockApres.lessThanOrEqualTo(0)) {
          notes.push(`Lot ${a.lot?.lotNumber ?? 'sans lot'} totalement épuisé.`);
        } else {
          notes.push(
            `Le lot ${a.lot?.lotNumber ?? 'sans lot'} a été touché de ${toNumber(dec(a.takenQuantity), 3)} unités avant validation.`,
          );
        }
      }

      if (restant.lessThanOrEqualTo(0)) continue;

      // Stock libre de la cellule promise, en ignorant les parts de CETTE
      // reservation (qui sont en train d'etre honorees, pas de lui bloquer).
      const libres = reservedByCell(
        await activeAllocations({ articleIds: [a.articleId], excludeReservationId: id }, tx),
      );
      const libreCellule = await cellStock(cell, tx).then((y) =>
        y.sub(libres.get(cellKey(cell)) ?? new Prisma.Decimal(0)),
      );

      if (libreCellule.greaterThanOrEqualTo(restant)) {
        sorties.push({ ...cell, quantity: restant, depuisAllocation: a.id });
        continue;
      }

      // La cellule promise ne peut plus tenir le reliquat : on sert ce qui reste
      // et on rejoue un FEFO sur le stock actuel (regle 4).
      const manque = restant.sub(libreCellule);
      if (libreCellule.greaterThan(0)) {
        sorties.push({ ...cell, quantity: libreCellule, depuisAllocation: a.id });
      }

      // Re-FEFO sur le stock libre : le sous-ensemble de cellules encore libres est
      // ici la bonne base, et la SEULE sure. Sommmer des `libre` negatifs ferait
      // baisser `libreTotal` et pourrait produire une quantite de sortie negative.
      const repli = (await availabilityRows(a.articleId, tx, { excludeReservationId: id })).lignes;
      const libreTotal = repli.reduce<Prisma.Decimal>((s, r) => s.add(dec(r.libre)), new Prisma.Decimal(0));
      if (libreTotal.lessThan(manque)) {
        throw badRequest(
          `Validation impossible : le stock réellement disponible ne couvre plus la réservation ${current.ref}. ` +
            `Manque ${toNumber(manque, 3)} unité(s) sur l'article ${a.articleId}. ` +
            `Aucune sortie n'a été enregistrée et la réservation reste active : réapprovisionnez le stock puis validez à nouveau.`,
        );
      }

      let reste = manque;
      for (const r of repli) {
        if (reste.lte(0)) break;
        const part = dec(r.libre).greaterThan(reste) ? reste : dec(r.libre);
        sorties.push({
          articleId: a.articleId,
          lotId: r.lotId,
          depotId: r.depotId,
          locationId: r.locationId,
          quantity: part,
        });
        reconstitutions.push({
          articleId: a.articleId,
          lotNumber: r.lotNumber,
          quantity: toNumber(part, 3),
        });
        reste = reste.sub(part);
      }
      notes.push(
        `Lot ${a.lot?.lotNumber ?? 'sans lot'} amputé : ${toNumber(manque, 3)} unité(s) reprises sur le stock disponible (FEFO).`,
      );
    }

    const today = new Date();
    for (const s of sorties) {
      await tx.move.create({
        data: {
          typeId: sortieId,
          articleId: s.articleId,
          lotId: s.lotId,
          quantity: toNumber(s.quantity, 3),
          sens: -1,
          depotId: s.depotId,
          locationId: s.locationId,
          partnerId: current.partnerId,
          docNumber: current.ref,
          movementDate: today,
          observation: 'Réservation validée',
          currency: currencyByArticle.get(s.articleId) ?? 'DZD',
          reservationId: id,
          createdBy: userId,
        },
      });
    }

    return tx.reservation.update({
      where: { id },
      data: { status: 'REALISE', closedBy: userId, closedAt: today, closeReason: 'VALIDEE' },
    });
  });

  await audit(userId, 'VALIDATION', 'reservation', String(id), {
    ref: updated.ref,
    action: 'VALIDATION',
    status: 'REALISE',
    sortiesCreees: true,
    notes,
    ...(amputations.length ? { amputations } : {}),
    ...(reconstitutions.length ? { reconstitutions } : {}),
  });

  return { ...(await getReservation(id)), notes };
}

/**
 * Expire une reservation dans SA propre transaction. Renvoie false si elle etait deja
 * close (par un utilisateur ou par un autre balayage) : deux balayages qui se croisent
 * ne peuvent donc pas se generer d'exception, l'un des deux ignore simplement la ligne.
 */
async function expireOne(tx: Db, id: bigint): Promise<boolean> {
  const closed = await tx.reservation.updateMany({
    where: { id, status: 'ACTIF' },
    data: { status: 'EXPIRE', closedAt: new Date(), closedBy: null, closeReason: 'EXPIRE' },
  });
  return closed.count > 0;
}

/**
 * Cas 3 : la date de fin est depassee -> annulation automatique. La promesse
 * s'eteint ; le stock n'avait jamais bouge. Appele a chaque lecture des
 * reservations.
 */
export async function expireReservations() {
  const limit = todayStart();
  const due = await prisma.reservation.findMany({
    where: { status: 'ACTIF', endDate: { lt: limit } },
    select: { id: true },
  });
  let expired = 0;
  for (const r of due) {
    if (await prisma.$transaction((tx) => expireOne(tx, r.id))) expired += 1;
  }
  return expired;
}

export async function listReservations(filters: { status?: string; partnerId?: number } = {}) {
  await expireReservations();
  const where: Prisma.ReservationWhereInput = {};
  if (filters.status) where.status = filters.status as ReservationStatus;
  if (filters.partnerId) where.partnerId = filters.partnerId;
  const rows = await prisma.reservation.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }],
    include: includeFull,
  });
  return serialize(rows);
}

export async function getReservation(id: bigint) {
  await expireReservations();
  const row = await prisma.reservation.findUnique({ where: { id }, include: includeFull });
  if (!row) throw notFound('Réservation introuvable');
  return serialize([row])[0];
}

/** Synthese pour les indicateurs de la page. */
export async function synthesis() {
  await expireReservations();
  const today = todayStart();
  const dans7 = new Date(today.getTime() + 7 * 24 * 3600 * 1000);
  const [actives, expirees, expire7, realises] = await Promise.all([
    prisma.reservation.count({ where: { status: 'ACTIF' } }),
    prisma.reservation.count({ where: { status: 'EXPIRE' } }),
    prisma.reservation.count({ where: { status: 'ACTIF', endDate: { gte: today, lt: dans7 } } }),
    prisma.reservation.count({ where: { status: 'REALISE' } }),
  ]);
  // Quantites promisees, par article : alimente la ligne "deja reserve" de l'etat de stock.
  const parts = await activeAllocations();
  const parArticle = new Map<number, Prisma.Decimal>();
  for (const p of parts) {
    parArticle.set(p.articleId, (parArticle.get(p.articleId) ?? new Prisma.Decimal(0)).add(p.remaining));
  }
  return {
    actives,
    expirees,
    expire7,
    realises,
    articlesReserves: parArticle.size,
    quantiteReservee: toNumber(
      [...parArticle.values()].reduce<Prisma.Decimal>((a, d) => a.add(d), new Prisma.Decimal(0)),
      3,
    ),
    plafondPct: await plafondPct(),
  };
}