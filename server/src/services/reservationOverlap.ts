import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { dec, toNumber } from '../utils/decimal';
import { issueConfirmToken } from '../utils/confirmToken';
import { activeAllocations, cellKey, type ReservedPart, type StockCell } from './reservationStock';

/**
 * D20, regle 3 : alerte immediate quand une sortie risque de toucher un lot reserve.
 *
 * Le raisonnement tient en trois quantites, sur UNE cellule (article + lot + depot
 * + emplacement), qui est la maille a laquelle un mouvement retire vraiment du stock :
 *
 *     Y = quantite totale du lot      (stock physique, brut)
 *     X = quantite reserve sur ce lot (promesses des reservations ACTIF)
 *     Z = quantite a sortir           (cette operation)
 *
 *   - si X + Z <= Y  : la sortie ne touche pas la promesse, rien a signaler.
 *     Le stock restant Y - Z couvre toujours les X unites promise.
 *   - si X + Z >  Y  : la sortie mord dans la promesse. On refuse l'ecriture et
 *     on demande une confirmation explicite. L'overlap affiche est
 *
 *         overlap = X + Z - Y
 *
 *     et c'est exactement, unite pour unite, ce que l'accord utilisateur autorise
 *     a prelever sur les reservations concernees : apres la sortie, le stock
 *     restant (Y - Z) est exactement egal a la promesse restante (X - overlap).
 *     C'est ce qui garantit qu'une reservation validee plus tard pourra toujours
 *     etre servie, sans avoir a refaire un FEFO.
 */

type Db = Prisma.TransactionClient;

/** Une cellule et son contexte d'empietement. */
export interface OverlapCell {
  cell: StockCell;
  /** Stock physique de la cellule (Y). */
  stockCellule: Prisma.Decimal;
  /** Quantite que l'operation retire (Z). */
  quantite: Prisma.Decimal;
  /** Code du mouvement : SORTIE, PERTE, AJUSTEMENT... (pour le message). */
  operation: string;
}

export interface OverlapConflict {
  /** Y */
  stockCellule: number;
  /** X */
  reserve: number;
  /** Z */
  quantite: number;
  /** X + Z - Y */
  overlap: number;
  lotNumber: string | null;
  lotId: number | null;
  depotId: number;
  locationId: number | null;
  articleId: number;
  operation: string;
  /** Reservations dont la promesse sera amputee si l'utilisateur accepte. */
  reservations: Array<{ ref: string; id: string; amputee: number }>;
  message: string;
}

/** Nom lisible du lot pour les messages : numero, ou "sans lot" si l'article n'est pas lot-trace. */
function lotLabel(lotNumber: string | null): string {
  return lotNumber ?? 'sans lot';
}

/**
 * Message d'information attendu par le directeur. Le calcul est refait ici a
 * partir des trois quantites, jamais repris d'un champ stocke : c'est la seule
 * facon d'avoir un message qui reste juste si les quantites ont bouge entre-temps.
 */
export function overlapFormula(lotNumber: string | null, Y: number, X: number, Z: number): string {
  return `le lot ${lotLabel(lotNumber)} a été touché de ${toNumber(dec(X).add(dec(Z)).sub(dec(Y)), 3)} unités (${X} réservé + ${Z} à sortir − ${Y} au lot)`;
}

/**
 * Detecte un empietement. Renvoie null si l'ecriture est sans consequence sur
 * les promesses, et le detail du conflit sinon.
 */
export async function detectOverlap(
  input: OverlapCell,
  db: Db = prisma as unknown as Db,
): Promise<OverlapConflict | null> {
  const parts = await activeAllocations(
    { articleIds: [input.cell.articleId], depotId: input.cell.depotId },
    db,
  ).then((all) =>
    all.filter((p) => cellKey(p) === cellKey(input.cell)),
  );

  const X = parts.reduce<Prisma.Decimal>((a, p) => a.add(p.remaining), new Prisma.Decimal(0));
  if (X.lessThanOrEqualTo(0)) return null;

  const Y = input.stockCellule;
  // Sans depassement, la sortie laisse assez de stock pour tenir la promesse.
  if (X.add(input.quantite).lessThanOrEqualTo(Y)) return null;

  const overlap = X.add(input.quantite).sub(Y);
  const lotNumber = parts[0]?.lotNumber ?? null;

  // Repartition de l'overlap sur les reservations concernees (ordre FEFO deja
  // applique par activeAllocations) : sert a dire au utilisateur quelles
  // promesses seront amputees, et a tracer precisement laquelle.
  let reste = overlap;
  const touched = new Map<string, { ref: string; qte: Prisma.Decimal }>();
  for (const p of parts) {
    if (reste.lessThanOrEqualTo(0)) break;
    const part = p.remaining.lessThan(reste) ? p.remaining : reste;
    const key = String(p.reservationId);
    const cur = touched.get(key) ?? { ref: p.reservationRef, qte: new Prisma.Decimal(0) };
    cur.qte = cur.qte.add(part);
    touched.set(key, cur);
    reste = reste.sub(part);
  }

  return {
    stockCellule: toNumber(Y, 3),
    reserve: toNumber(X, 3),
    quantite: toNumber(input.quantite, 3),
    overlap: toNumber(overlap, 3),
    lotNumber,
    lotId: input.cell.lotId,
    depotId: input.cell.depotId,
    locationId: input.cell.locationId,
    articleId: input.cell.articleId,
    operation: input.operation,
    reservations: [...touched.entries()].map(([id, v]) => ({
      id,
      ref: v.ref,
      amputee: toNumber(v.qte, 3),
    })),
    message:
      `Cette opération touche du stock réservé : ${overlapFormula(lotNumber, toNumber(Y, 3), toNumber(X, 3), toNumber(input.quantite, 3))}. ` +
      `Réservation(s) concernée(s) : ${[...touched.values()].map((v) => v.ref).join(', ')}. ` +
      `Confirmez-vous que ces quantités reservées peuvent être amputées ?`,
  };
}

/** Charge utile du jeton de confirmation : elle identifie l'operation, rien de plus. */
export function overlapTokenPayload(
  conflict: Pick<OverlapConflict, 'articleId' | 'lotId' | 'depotId' | 'locationId' | 'quantite' | 'operation'>,
  userId: number,
): Record<string, string | number> {
  return {
    op: 'EMPIETEMENT_RESERVATION',
    article: conflict.articleId,
    lot: conflict.lotId ?? '',
    depot: conflict.depotId,
    emplacement: conflict.locationId ?? '',
    qte: conflict.quantite,
    type: conflict.operation,
    user: userId,
  };
}

export function issueOverlapToken(
  conflict: Pick<OverlapConflict, 'articleId' | 'lotId' | 'depotId' | 'locationId' | 'quantite' | 'operation'>,
  userId: number,
): string {
  return issueConfirmToken(overlapTokenPayload(conflict, userId));
}

/** Ce qu'un accord utilisateur a preleve sur la promesse d'une reservation. */
export interface Amputation {
  reservationRef: string;
  reservationId: string;
  allocationId: string;
  lotNumber: string | null;
  quantite: number;
}

/**
 * Consomme l'overlap sur les promesses concernees : chaque part voit son
 * `takenQuantity` augmenter. C'est la SEULE voie par laquelle une reservation
 * peut perdre des unites sans que la reservation elle-meme ne change de statut.
 *
 * Apres cet appel, l'invariant de la cellule tient : promesse restante = stock
 * restant. La validation d'une reservation pourra donc trouver son reliquat sans
 * avoir a refaire un FEFO, et si elle doit en refaire un (lot entierement vide),
 * elle le fera sur le stock reellement libre.
 */
export async function consumeOverlap(
  overlap: Prisma.Decimal,
  cell: StockCell,
  db: Db = prisma as unknown as Db,
): Promise<Amputation[]> {
  const parts = (await activeAllocations(
    { articleIds: [cell.articleId], depotId: cell.depotId },
    db,
  )).filter((p) => cellKey(p) === cellKey(cell));

  const out: Amputation[] = [];
  let reste = overlap;
  for (const p of parts as ReservedPart[]) {
    if (reste.lessThanOrEqualTo(0)) break;
    const part = p.remaining.lessThan(reste) ? p.remaining : reste;
    if (part.lessThanOrEqualTo(0)) continue;
    await db.reservationAllocation.update({
      where: { id: p.allocationId },
      data: { takenQuantity: { increment: toNumber(part, 3) } },
    });
    out.push({
      reservationRef: p.reservationRef,
      reservationId: String(p.reservationId),
      allocationId: String(p.allocationId),
      lotNumber: p.lotNumber,
      quantite: toNumber(part, 3),
    });
    reste = reste.sub(part);
  }
  return out;
}