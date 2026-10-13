"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.overlapFormula = overlapFormula;
exports.detectOverlap = detectOverlap;
exports.overlapTokenPayload = overlapTokenPayload;
exports.issueOverlapToken = issueOverlapToken;
exports.consumeOverlap = consumeOverlap;
const client_1 = require("@prisma/client");
const prisma_1 = require("../prisma");
const decimal_1 = require("../utils/decimal");
const confirmToken_1 = require("../utils/confirmToken");
const reservationStock_1 = require("./reservationStock");
/** Nom lisible du lot pour les messages : numero, ou "sans lot" si l'article n'est pas lot-trace. */
function lotLabel(lotNumber) {
    return lotNumber ?? 'sans lot';
}
/**
 * Message d'information attendu par le directeur. Le calcul est refait ici a
 * partir des trois quantites, jamais repris d'un champ stocke : c'est la seule
 * facon d'avoir un message qui reste juste si les quantites ont bouge entre-temps.
 */
function overlapFormula(lotNumber, Y, X, Z, geste = 'à sortir') {
    return `le lot ${lotLabel(lotNumber)} a été touché de ${(0, decimal_1.toNumber)((0, decimal_1.dec)(X).add((0, decimal_1.dec)(Z)).sub((0, decimal_1.dec)(Y)), 3)} unités (${X} réservé + ${Z} ${geste} − ${Y} au lot)`;
}
/**
 * Detecte un empietement. Renvoie null si l'ecriture est sans consequence sur
 * les promesses, et le detail du conflit sinon.
 */
async function detectOverlap(input, db = prisma_1.prisma) {
    const parts = await (0, reservationStock_1.activeAllocations)({ articleIds: [input.cell.articleId], depotId: input.cell.depotId }, db).then((all) => all.filter((p) => (0, reservationStock_1.cellKey)(p) === (0, reservationStock_1.cellKey)(input.cell)));
    const X = parts.reduce((a, p) => a.add(p.remaining), new client_1.Prisma.Decimal(0));
    if (X.lessThanOrEqualTo(0))
        return null;
    const Y = input.stockCellule;
    // Sans depassement, la sortie laisse assez de stock pour tenir la promesse.
    if (X.add(input.quantite).lessThanOrEqualTo(Y))
        return null;
    const overlap = X.add(input.quantite).sub(Y);
    const lotNumber = parts[0]?.lotNumber ?? null;
    // Repartition de l'overlap sur les reservations concernees (ordre FEFO deja
    // applique par activeAllocations) : sert a dire au utilisateur quelles
    // promesses seront amputees, et a tracer precisement laquelle.
    let reste = overlap;
    const touched = new Map();
    for (const p of parts) {
        if (reste.lessThanOrEqualTo(0))
            break;
        const part = p.remaining.lessThan(reste) ? p.remaining : reste;
        const key = String(p.reservationId);
        const cur = touched.get(key) ?? { ref: p.reservationRef, qte: new client_1.Prisma.Decimal(0) };
        cur.qte = cur.qte.add(part);
        touched.set(key, cur);
        reste = reste.sub(part);
    }
    return {
        stockCellule: (0, decimal_1.toNumber)(Y, 3),
        reserve: (0, decimal_1.toNumber)(X, 3),
        quantite: (0, decimal_1.toNumber)(input.quantite, 3),
        overlap: (0, decimal_1.toNumber)(overlap, 3),
        lotNumber,
        lotId: input.cell.lotId,
        depotId: input.cell.depotId,
        locationId: input.cell.locationId,
        articleId: input.cell.articleId,
        operation: input.operation,
        reservations: [...touched.entries()].map(([id, v]) => ({
            id,
            ref: v.ref,
            amputee: (0, decimal_1.toNumber)(v.qte, 3),
        })),
        message: `Cette opération touche du stock réservé : ${overlapFormula(lotNumber, (0, decimal_1.toNumber)(Y, 3), (0, decimal_1.toNumber)(X, 3), (0, decimal_1.toNumber)(input.quantite, 3), input.geste)}. ` +
            `Réservation(s) concernée(s) : ${[...touched.values()].map((v) => v.ref).join(', ')}. ` +
            `Confirmez-vous que ces quantités reservées peuvent être amputées ?`,
    };
}
/** Charge utile du jeton de confirmation : elle identifie l'operation, rien de plus. */
function overlapTokenPayload(conflict, userId) {
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
function issueOverlapToken(conflict, userId) {
    return (0, confirmToken_1.issueConfirmToken)(overlapTokenPayload(conflict, userId));
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
async function consumeOverlap(overlap, cell, db = prisma_1.prisma) {
    const parts = (await (0, reservationStock_1.activeAllocations)({ articleIds: [cell.articleId], depotId: cell.depotId }, db)).filter((p) => (0, reservationStock_1.cellKey)(p) === (0, reservationStock_1.cellKey)(cell));
    const out = [];
    let reste = overlap;
    for (const p of parts) {
        if (reste.lessThanOrEqualTo(0))
            break;
        const part = p.remaining.lessThan(reste) ? p.remaining : reste;
        if (part.lessThanOrEqualTo(0))
            continue;
        await db.reservationAllocation.update({
            where: { id: p.allocationId },
            data: { takenQuantity: { increment: (0, decimal_1.toNumber)(part, 3) } },
        });
        out.push({
            reservationRef: p.reservationRef,
            reservationId: String(p.reservationId),
            allocationId: String(p.allocationId),
            lotNumber: p.lotNumber,
            quantite: (0, decimal_1.toNumber)(part, 3),
        });
        reste = reste.sub(part);
    }
    return out;
}
//# sourceMappingURL=reservationOverlap.js.map