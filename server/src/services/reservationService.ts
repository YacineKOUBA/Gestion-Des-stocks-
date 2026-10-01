import { prisma } from '../prisma';
import { MoveTypeCode, Prisma, type ReservationStatus } from '@prisma/client';
import { badRequest, notFound } from '../utils/apiError';
import { audit } from '../utils/audit';
import { dec, toNumber } from '../utils/decimal';

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

export interface AvailabilityRow {
  lotId: number | null;
  lotNumber: string | null;
  expiryDate: Date | null;
  depotId: number;
  depotLabel: string;
  locationId: number | null;
  locationLabel: string | null;
  quantity: number;
}

/** Debut de la journee courante (UTC) : une reservation dont endDate < aujourd'hui a expire. */
function todayStart(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function dayStart(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/**
 * Stock disponible d'un article, detaille par lot / depot / emplacement et Classe
 * par ORDRE DE PEREMPTION CROISSANTE (FEFO : le lot qui perime le plus tot part en premier).
 *
 * Reservee a un seul article a la fois : aucune quantite d'un autre article (donc d'une
 * autre unite) n'entre dans le calcul. Le lot "null" correspond aux articles non
 * lot-traces ; ces lignes passent apres les lots dates (ils n'ont pas de peremption).
 */
async function availabilityRows(articleId: number, db: Db): Promise<AvailabilityRow[]> {
  const article = await db.article.findUnique({
    where: { id: articleId },
    select: { isLotTracked: true },
  });
  if (!article) throw notFound('Article introuvable');

  // Article lot-trace : on interroge tous ses lots. Sinon une seule "ligne" sans lot.
  const lotIds: number[] = [];
  let lots: { id: number; lotNumber: string; expiryDate: Date | null }[] = [];
  if (article.isLotTracked) {
    lots = await db.lot.findMany({
      where: { articleId },
      select: { id: true, lotNumber: true, expiryDate: true },
    });
    for (const l of lots) lotIds.push(l.id);
  }
  const lotById = new Map(lots.map((l) => [l.id, l]));
  const lotFilter: Prisma.MoveWhereInput = article.isLotTracked
    ? { lotId: { in: lotIds } }
    : { lotId: null };

  // Tous depots et emplacements confondus : la reservation choisit elle-meme les lots
  // (FEFO), le client n'a pas a designating de depot dans le formulaire.
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
    };
    cur.quantity = cur.quantity + toNumber(dec(m.quantity).mul(m.sens), 3);
    map.set(key, cur);
  }

  return [...map.values()]
    .filter((r) => r.quantity > 0)
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
    });
}

/** Disponibilite totale d'un article + detail FEFO (alimente le formulaire). */
export async function availability(articleId: number) {
  const rows = await availabilityRows(articleId, prisma as unknown as Db);
  const total = rows.reduce((a, r) => a + r.quantity, 0);
  return {
    articleId,
    total: toNumber(dec(total), 3),
    lignes: rows.map((r) => ({ ...r, expiryDate: r.expiryDate?.toISOString().slice(0, 10) ?? null })),
  };
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
 * Cree une reservation : le stock des articles est BLOQUE immediatement, en puisant
 * dans les lots selon la peremption la plus proche (FEFO). Chaque part reservee genere
 * un mouvement RESERVATION (sens -1) rattache a la reservation : le stock disponible
 * diminue exactement comme pour une sortie ou un pret.
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
    prisma.partner.findUnique({ where: { id: input.partnerId }, select: { id: true, isActive: true } }),
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

  // Devise portee par chaque article, reportee sur ses mouvements de blocage (meme si
  // ces mouvements n'ont aucun montant : ils doivent rester dans la devise de l'article).
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

      const typeId = (await tx.moveType.findUniqueOrThrow({ where: { code: 'RESERVATION' } })).id;
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

      const today = todayStart();
      for (const line of lines) {
        const rows = await availabilityRows(line.articleId, tx);
        const total = rows.reduce<Prisma.Decimal>((a, r) => a.add(dec(r.quantity)), new Prisma.Decimal(0));
        if (total.lessThan(line.quantity)) {
          const art = await tx.article.findUnique({
            where: { id: line.articleId },
            select: { code: true, designation: true },
          });
          throw badRequest(
            `Stock insuffisant pour l'article ${art?.code ?? line.articleId} - ${art?.designation ?? ''} ` +
              `(disponible : ${toNumber(total, 3)})`,
          );
        }

        // FEFO : on consomme les lignes deja triees par peremption croissante.
        let reste = line.quantity;
        for (const row of rows) {
          if (reste.lte(0)) break;
          const part = dec(row.quantity).greaterThan(reste) ? reste : dec(row.quantity);
          await tx.move.create({
            data: {
              typeId,
              articleId: line.articleId,
              lotId: row.lotId,
              quantity: toNumber(part, 3),
              sens: -1,
              depotId: row.depotId,
              locationId: row.locationId,
              partnerId: input.partnerId,
              docNumber: reservation.ref,
              movementDate: today,
              observation: 'Réservation',
              currency: currencyByArticle.get(line.articleId) ?? 'DZD',
              reservationId: reservation.id,
              createdBy: userId,
            },
          });
          reste = reste.sub(part);
        }

        await tx.reservationLine.create({
          data: {
            reservationId: reservation.id,
            articleId: line.articleId,
            quantity: toNumber(line.quantity, 3),
          },
        });
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

/** Cloture par annulation (manuelle ou expiration) : les mouvements passent ANNULE. */
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
    // Les mouvements ANNULE sont ignores par le calcul de stock : le stock est rendu.
    await tx.move.updateMany({
      where: { reservationId: id, status: 'ACTIF' },
      data: { status: 'ANNULE', canceledBy: userId, canceledAt: new Date() },
    });
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

/** Cas 1 : l'utilisateur annule la reservation. Le stock redevient disponible. */
export async function cancelReservation(id: bigint, userId: number) {
  const closed = await closeAsCancelled(id, 'ANNULE', 'MANUEL', userId);
  await audit(userId, 'ANNULATION', 'reservation', String(id), { ref: closed.ref, reason: 'MANUEL' });
  return getReservation(id);
}

/**
 * Cas 2 : l'utilisateur VALIDE la reservation (l'acteur a recupere sa reservation).
 * Les mouvements de blocage deviennent de vraies SORTIES : le stock reste retire.
 * Trace dans le journal d'audit comme une VALIDATION (et non une simple modification),
 * pour qu'on retrouve d'un coup d'oeil les reservations validees et leur validateur.
 */
export async function validateReservation(id: bigint, userId: number) {
  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.reservation.findUnique({
      where: { id },
      select: { status: true, ref: true },
    });
    if (!current) throw notFound('Réservation introuvable');
    if (current.status !== 'ACTIF') {
      throw badRequest(`Cette réservation est déjà clôturée (${current.status})`);
    }
    const sortieId = (await tx.moveType.findUniqueOrThrow({ where: { code: MoveTypeCode.SORTIE } })).id;
    await tx.move.updateMany({
      where: { reservationId: id, status: 'ACTIF' },
      data: { typeId: sortieId },
    });
    return tx.reservation.update({
      where: { id },
      data: { status: 'REALISE', closedBy: userId, closedAt: new Date(), closeReason: 'VALIDEE' },
    });
  });
  await audit(userId, 'VALIDATION', 'reservation', String(id), {
    ref: updated.ref,
    action: 'VALIDATION',
    status: 'REALISE',
  });
  return getReservation(id);
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
  if (closed.count === 0) return false;
  // Les mouvements ANNULE sont ignores par le calcul de stock : le stock est rendu.
  await tx.move.updateMany({
    where: { reservationId: id, status: 'ACTIF' },
    data: { status: 'ANNULE', canceledAt: new Date() },
  });
  return true;
}

/**
 * Cas 3 : la date de fin est depassee -> annulation automatique, le stock est rendu.
 * Appele a chaque lecture des reservations et par une balayage periodique.
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
  return { actives, expirees, expire7, realises };
}
