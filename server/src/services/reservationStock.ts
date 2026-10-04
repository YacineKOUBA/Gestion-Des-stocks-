import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { dec, toNumber } from '../utils/decimal';

/**
 * D20 - Quantites reservees.
 *
 * Une reservation ne bouge plus le stock (elle fige des lots dans
 * `reservation_allocations`). Ce module est donc le SEUL endroit ou l'on sait
 * combien d'unites sont promises, et il alimente trois consommateurs :
 *
 *   - l'ecran Etat de stock  : colonnes "Deja reserve" et "Stock libre" ;
 *   - le formulaire de reservation : le FEFO se fait sur le stock LIBRE, pas
 *     sur le stock brut (decision D20 n° 2 du directeur) ;
 *   - le point de controle d'empietement de `movementService` : toute operation
 *     qui retire du stock doit savoir si elle touche une promesse.
 *
 * Regle de calcul, appliquee partout sans exception :
 *
 *     restant d'une part reservee = quantity - takenQuantity
 *
 * `takenQuantity` est ce qu'une sortie EXTERIEURE a deja consomme sur cette
 * promise avec l'accord explicite de l'utilisateur (regle 3 de D20). Ce n'est pas
 * une anomalie : c'est le mecanisme par lequel un lot reserve peut etre ampute.
 */

type Db = Prisma.TransactionClient;

export const PLAFOND_CODE = 'RESERVATION_PLAFOND_PCT';

/** Plafond de securite en valeur code : evite un blocage total si le parametre est absent. */
const PLAFOND_DEFAUT = 15;

/** Maille de raisonnement : une cellule article + lot + depot + emplacement. */
export interface StockCell {
  articleId: number;
  lotId: number | null;
  depotId: number;
  locationId: number | null;
}

export function cellKey(cell: StockCell): string {
  return `${cell.articleId}|${cell.lotId ?? ''}|${cell.depotId}|${cell.locationId ?? ''}`;
}

/** Une part promise : une reservation ACTIF figee sur une cellule. */
export interface ReservedPart {
  allocationId: bigint;
  reservationId: bigint;
  reservationRef: string;
  reservationCreatedAt: Date;
  lineId: bigint;
  articleId: number;
  lotId: number | null;
  lotNumber: string | null;
  expiryDate: Date | null;
  depotId: number;
  locationId: number | null;
  /** Ce que la reservation avait fige a la creation. */
  promised: Prisma.Decimal;
  /** Part deja consommee par une sortie exterieure autorisee (regle 3). */
  taken: Prisma.Decimal;
  /** Ce qui reste a servir a la validation. */
  remaining: Prisma.Decimal;
}

export interface ReservedFilter {
  articleIds?: number[];
  depotId?: number;
  categoryId?: number;
  familyId?: number;
  search?: string;
  /**
   * D21 : ne garder que les promesses de cet acteur. Utilise par le plafond, qui
   * porte sur le cumul des promesses d'un acteur et non sur la reserve globale du
   * produit. Sans ce filtre, deux acteurs concurrents seVerifieraient l'un l'autre.
   */
  partnerId?: number;
  /**
   * Exclut une reservation du calcul. Indispensable pendant la validation : la
   * reservation en cours de validation est encore ACTIF, ses propres parts
   * seraient donc comptees comme reservees et son propre stock passerait pour
   * indisponible.
   */
  excludeReservationId?: bigint;
}

/**
 * Toutes les parts encore promises, triees FEFO (peremption la plus proche
 * d'abord). L'ordre sert aux deux consommateurs qui doivent choisir par quel
 * lot prelever : la reconstitution d'une validation et la consommation d'un
 * empietement.
 */
export async function activeAllocations(
  filter: ReservedFilter = {},
  db: Db = prisma as unknown as Db,
): Promise<ReservedPart[]> {
  // Le filtre sur la reservation est construit d'un bloc : `reservation` est une
  // relation, donc ses criteres sont tous dans le meme objet.
  const reservation: Prisma.ReservationWhereInput = {
    status: 'ACTIF',
    // D21 : ne garder que les promesses de cet acteur.
    ...(filter.partnerId != null ? { partnerId: filter.partnerId } : {}),
    ...(filter.excludeReservationId != null ? { id: { not: filter.excludeReservationId } } : {}),
  };
  const where: Prisma.ReservationAllocationWhereInput = { reservation };
  if (filter.articleIds?.length) where.articleId = { in: filter.articleIds };
  if (filter.depotId) where.depotId = filter.depotId;
  const article: Prisma.ArticleWhereInput = {};
  if (filter.categoryId) article.categoryId = filter.categoryId;
  if (filter.familyId) article.familyId = filter.familyId;
  if (filter.search) {
    article.OR = [
      { designation: { contains: filter.search, mode: 'insensitive' } },
      { code: { contains: filter.search } },
    ];
  }
  if (Object.keys(article).length) where.article = article;

  const rows = await db.reservationAllocation.findMany({
    where,
    select: {
      id: true,
      reservationId: true,
      reservationLineId: true,
      articleId: true,
      lotId: true,
      depotId: true,
      locationId: true,
      quantity: true,
      takenQuantity: true,
      lot: { select: { lotNumber: true, expiryDate: true } },
      reservation: { select: { ref: true, createdAt: true } },
    },
  });

  return rows
    .map((r) => {
      const promised = dec(r.quantity);
      const taken = dec(r.takenQuantity);
      return {
        allocationId: r.id,
        reservationId: r.reservationId,
        reservationRef: r.reservation.ref,
        reservationCreatedAt: r.reservation.createdAt,
        lineId: r.reservationLineId,
        articleId: r.articleId,
        lotId: r.lotId,
        lotNumber: r.lot?.lotNumber ?? null,
        expiryDate: r.lot?.expiryDate ?? null,
        depotId: r.depotId,
        locationId: r.locationId,
        promised,
        taken,
        remaining: promised.sub(taken),
      };
    })
    .sort((a, b) => {
      // FEFO : peremption la plus proche d'abord ; les lots sans date en dernier.
      if (a.lotId == null && b.lotId != null) return 1;
      if (a.lotId != null && b.lotId == null) return -1;
      if (a.expiryDate && b.expiryDate) {
        const d = a.expiryDate.getTime() - b.expiryDate.getTime();
        if (d !== 0) return d;
      } else if (a.expiryDate !== b.expiryDate) {
        return a.expiryDate ? -1 : 1;
      }
      if (a.lotNumber && b.lotNumber && a.lotNumber !== b.lotNumber) {
        return a.lotNumber.localeCompare(b.lotNumber);
      }
      // A peremption egale, la promise la plus ancienne est la plus exposee.
      const c = a.reservationCreatedAt.getTime() - b.reservationCreatedAt.getTime();
      if (c !== 0) return c;
      return Number(a.allocationId - b.allocationId);
    });
}

/** Quantite promise par cellule. */
export function reservedByCell(parts: ReservedPart[]): Map<string, Prisma.Decimal> {
  const out = new Map<string, Prisma.Decimal>();
  for (const p of parts) {
    const k = cellKey(p);
    out.set(k, (out.get(k) ?? new Prisma.Decimal(0)).add(p.remaining));
  }
  return out;
}

/**
 * Quantite promise par article, tous depots et lots confondus.
 *
 * D21 : c'est la somme du cumul d'un acteur. Appelee avec les seules parts de cet
 * acteur (filtre `partnerId`), elle donne exactement ce que le plafond doit
 * comparer a sa base.
 */
export function reservedByArticle(parts: ReservedPart[]): Map<number, Prisma.Decimal> {
  const out = new Map<number, Prisma.Decimal>();
  for (const p of parts) {
    out.set(p.articleId, (out.get(p.articleId) ?? new Prisma.Decimal(0)).add(p.remaining));
  }
  return out;
}

/** Quantite promise par article, dans un seul depot (filtre Depot de l'ecran stock). */
export function reservedByArticleDepot(
  parts: ReservedPart[],
): Map<string, Prisma.Decimal> {
  const out = new Map<string, Prisma.Decimal>();
  for (const p of parts) {
    const k = `${p.articleId}|${p.depotId}`;
    out.set(k, (out.get(k) ?? new Prisma.Decimal(0)).add(p.remaining));
  }
  return out;
}

// Cache court du plafond (evite une requete par ligne du formulaire). Le cache
// n'est utilise que sur le client principal : dans une transaction on relit la
// valeur, sinon on validerait une reservation contre un parametre anterieur.
let plafondCache: { at: number; pct: number } | null = null;

export async function plafondPct(db: Db = prisma as unknown as Db): Promise<number> {
  const principal = (db as unknown) === prisma;
  if (principal && plafondCache && Date.now() - plafondCache.at < 5000) return plafondCache.pct;
  const row = await db.setting.findUnique({ where: { code: PLAFOND_CODE } });
  const parsed = Number(row?.value ?? PLAFOND_DEFAUT);
  const pct = Number.isFinite(parsed) && parsed > 0 && parsed <= 100 ? parsed : PLAFOND_DEFAUT;
  if (principal) plafondCache = { at: Date.now(), pct };
  return pct;
}

/** Vide le cache du plafond : utilise quand le parametre vient d'etre modifie. */
export function invalidatePlafondCache(): void {
  plafondCache = null;
}

export interface PlafondState {
  /** Base du calcul : le stock libre du produit. */
  base: number;
  /** Ce que l'acteur a deja promis sur ce produit dans ses reservations ACTIF. */
  cumulActuel: number;
  /** Ce que la reservation en cours de creation ajoute. */
  demande: number;
  /** Plafond autorise, en unites. */
  plafond: number;
  pct: number;
  /** Cumul de l'acteur apres cette reservation. */
  cumulApresDemande: number;
  depasse: boolean;
}

/**
 * D21 : le plafond porte sur le CUMUL des promesses d'un acteur sur un produit,
 * plafonne a un pourcentage du STOCK LIBRE de ce produit.
 *
 * Il ne porte pas sur une reservation isolee : un acteur doit pouvoir repartir son
 * quota sur plusieurs reservations, et c'est le cumul qui l'empeche d'en reprendre
 * indefiniment. La base etant le stock libre, elle baisse a chaque promesse : un
 * acteur qui prend tout son quota d'un coup se ferme ensuite la porte lui-meme.
 * C'est le choix du directeur, assume ici et documente plutot que corrige en
 * silence.
 *
 * Ni la base ni le cumul ne sont lus par cette fonction : l'appelant les fournit.
 * C'est ce qui permet au meme calcul de servir la creation (plafond d'un acteur
 * donne) et l'apercu du formulaire (meme formule, demande nulle).
 */
export function computePlafond(input: {
  base: Prisma.Decimal;
  cumulActuel: Prisma.Decimal;
  demande: Prisma.Decimal;
  pct: number;
}): PlafondState {
  const plafond = input.base.mul(input.pct).div(100);
  const cumul = input.demande.add(input.cumulActuel);
  return {
    base: toNumber(input.base, 3),
    cumulActuel: toNumber(input.cumulActuel, 3),
    demande: toNumber(input.demande, 3),
    plafond: toNumber(plafond, 3),
    pct: input.pct,
    cumulApresDemande: toNumber(cumul, 3),
    depasse: cumul.greaterThan(plafond),
  };
}