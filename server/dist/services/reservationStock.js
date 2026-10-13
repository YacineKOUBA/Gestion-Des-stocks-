"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLAFOND_CODE = void 0;
exports.cellKey = cellKey;
exports.activeAllocations = activeAllocations;
exports.reservedByCell = reservedByCell;
exports.reservedByArticle = reservedByArticle;
exports.reservedByArticleDepot = reservedByArticleDepot;
exports.plafondPct = plafondPct;
exports.invalidatePlafondCache = invalidatePlafondCache;
exports.computePlafond = computePlafond;
const client_1 = require("@prisma/client");
const prisma_1 = require("../prisma");
const decimal_1 = require("../utils/decimal");
exports.PLAFOND_CODE = 'RESERVATION_PLAFOND_PCT';
/** Plafond de securite en valeur code : evite un blocage total si le parametre est absent. */
const PLAFOND_DEFAUT = 15;
function cellKey(cell) {
    return `${cell.articleId}|${cell.lotId ?? ''}|${cell.depotId}|${cell.locationId ?? ''}`;
}
/**
 * Toutes les parts encore promises, triees FEFO (peremption la plus proche
 * d'abord). L'ordre sert aux deux consommateurs qui doivent choisir par quel
 * lot prelever : la reconstitution d'une validation et la consommation d'un
 * empietement.
 */
async function activeAllocations(filter = {}, db = prisma_1.prisma) {
    // Le filtre sur la reservation est construit d'un bloc : `reservation` est une
    // relation, donc ses criteres sont tous dans le meme objet.
    const reservation = {
        status: 'ACTIF',
        // D21 : ne garder que les promesses de cet acteur.
        ...(filter.partnerId != null ? { partnerId: filter.partnerId } : {}),
        ...(filter.excludeReservationId != null ? { id: { not: filter.excludeReservationId } } : {}),
    };
    const where = { reservation };
    if (filter.articleIds?.length)
        where.articleId = { in: filter.articleIds };
    if (filter.depotId)
        where.depotId = filter.depotId;
    const article = {};
    if (filter.categoryId)
        article.categoryId = filter.categoryId;
    if (filter.familyId)
        article.familyId = filter.familyId;
    if (filter.search) {
        article.OR = [
            { designation: { contains: filter.search, mode: 'insensitive' } },
            { code: { contains: filter.search } },
        ];
    }
    if (Object.keys(article).length)
        where.article = article;
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
        const promised = (0, decimal_1.dec)(r.quantity);
        const taken = (0, decimal_1.dec)(r.takenQuantity);
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
        if (a.lotId == null && b.lotId != null)
            return 1;
        if (a.lotId != null && b.lotId == null)
            return -1;
        if (a.expiryDate && b.expiryDate) {
            const d = a.expiryDate.getTime() - b.expiryDate.getTime();
            if (d !== 0)
                return d;
        }
        else if (a.expiryDate !== b.expiryDate) {
            return a.expiryDate ? -1 : 1;
        }
        if (a.lotNumber && b.lotNumber && a.lotNumber !== b.lotNumber) {
            return a.lotNumber.localeCompare(b.lotNumber);
        }
        // A peremption egale, la promise la plus ancienne est la plus exposee.
        const c = a.reservationCreatedAt.getTime() - b.reservationCreatedAt.getTime();
        if (c !== 0)
            return c;
        return Number(a.allocationId - b.allocationId);
    });
}
/** Quantite promise par cellule. */
function reservedByCell(parts) {
    const out = new Map();
    for (const p of parts) {
        const k = cellKey(p);
        out.set(k, (out.get(k) ?? new client_1.Prisma.Decimal(0)).add(p.remaining));
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
function reservedByArticle(parts) {
    const out = new Map();
    for (const p of parts) {
        out.set(p.articleId, (out.get(p.articleId) ?? new client_1.Prisma.Decimal(0)).add(p.remaining));
    }
    return out;
}
/** Quantite promise par article, dans un seul depot (filtre Depot de l'ecran stock). */
function reservedByArticleDepot(parts) {
    const out = new Map();
    for (const p of parts) {
        const k = `${p.articleId}|${p.depotId}`;
        out.set(k, (out.get(k) ?? new client_1.Prisma.Decimal(0)).add(p.remaining));
    }
    return out;
}
// Cache court du plafond (evite une requete par ligne du formulaire). Le cache
// n'est utilise que sur le client principal : dans une transaction on relit la
// valeur, sinon on validerait une reservation contre un parametre anterieur.
let plafondCache = null;
async function plafondPct(db = prisma_1.prisma) {
    const principal = db === prisma_1.prisma;
    if (principal && plafondCache && Date.now() - plafondCache.at < 5000)
        return plafondCache.pct;
    const row = await db.setting.findUnique({ where: { code: exports.PLAFOND_CODE } });
    const parsed = Number(row?.value ?? PLAFOND_DEFAUT);
    const pct = Number.isFinite(parsed) && parsed > 0 && parsed <= 100 ? parsed : PLAFOND_DEFAUT;
    if (principal)
        plafondCache = { at: Date.now(), pct };
    return pct;
}
/** Vide le cache du plafond : utilise quand le parametre vient d'etre modifie. */
function invalidatePlafondCache() {
    plafondCache = null;
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
function computePlafond(input) {
    const plafond = input.base.mul(input.pct).div(100);
    const cumul = input.demande.add(input.cumulActuel);
    return {
        base: (0, decimal_1.toNumber)(input.base, 3),
        cumulActuel: (0, decimal_1.toNumber)(input.cumulActuel, 3),
        demande: (0, decimal_1.toNumber)(input.demande, 3),
        plafond: (0, decimal_1.toNumber)(plafond, 3),
        pct: input.pct,
        cumulApresDemande: (0, decimal_1.toNumber)(cumul, 3),
        depasse: cumul.greaterThan(plafond),
    };
}
//# sourceMappingURL=reservationStock.js.map