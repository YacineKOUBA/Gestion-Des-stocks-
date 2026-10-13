"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loanBalance = loanBalance;
exports.stockAllDepots = stockAllDepots;
exports.depotStockTotals = depotStockTotals;
exports.leastFilledDepot = leastFilledDepot;
exports.resolveStockTarget = resolveStockTarget;
exports.createLoan = createLoan;
exports.createRestitution = createRestitution;
exports.listLoans = listLoans;
exports.synthesis = synthesis;
const prisma_1 = require("../prisma");
const client_1 = require("@prisma/client");
const apiError_1 = require("../utils/apiError");
const audit_1 = require("../utils/audit");
const movementService_1 = require("./movementService");
const decimal_1 = require("../utils/decimal");
async function loanBalance(loanId, db = prisma_1.prisma) {
    const loan = await db.loan.findUnique({
        where: { id: loanId },
        select: { quantity: true },
    });
    if (!loan)
        throw (0, apiError_1.notFound)('Opération de prêt/emprunt introuvable');
    const rest = await db.loanRestitution.aggregate({
        where: { loanId },
        _sum: { quantity: true },
    });
    return (0, decimal_1.toNumber)((0, decimal_1.dec)(loan.quantity).sub((0, decimal_1.dec)(rest._sum.quantity)));
}
/**
 * Stock actif total d'un article, tous depots et tous emplacements confondus
 * (pour le lot fourni, ou sur tous les lots si lotId est null).
 * Utilise quand aucun depot n'est choisi : availableStock ne filtre que sur un
 * couple depot/emplacement et renverrait 0 pour un stock range en emplacements.
 */
async function stockAllDepots(articleId, lotId, db = prisma_1.prisma) {
    const moves = await db.move.findMany({
        where: { articleId, status: 'ACTIF', ...(lotId == null ? {} : { lotId }) },
        select: { quantity: true, sens: true },
    });
    return (0, decimal_1.toNumber)(moves.reduce((a, m) => a.add((0, decimal_1.dec)(m.quantity).mul(m.sens)), new client_1.Prisma.Decimal(0)));
}
/**
 * Taux d'occupation de chaque depot.
 * INVARIANT UNITE : on ne peut PAS additionner les stocks de depots dont les articles
 * n'ont pas la meme unite de mesure (KG + L n'est pas comparable). L'occupation est donc
 * mesuree par des COMPTES sans unite : nombre de lignes de stock (article x lot) en stock
 * positif et nombre d'articles distincts.
 */
async function depotStockTotals(db = prisma_1.prisma) {
    const depots = await db.depot.findMany({ orderBy: { id: 'asc' }, select: { id: true, label: true } });
    const moves = await db.move.findMany({
        where: { status: 'ACTIF' },
        select: { quantity: true, sens: true, depotId: true, articleId: true, lotId: true },
    });
    const parDepot = new Map();
    for (const m of moves) {
        if (!m.depotId)
            continue;
        let lignes = parDepot.get(m.depotId);
        if (!lignes) {
            lignes = new Map();
            parDepot.set(m.depotId, lignes);
        }
        const key = `${m.articleId}|${m.lotId ?? 0}`;
        lignes.set(key, (lignes.get(key) ?? new client_1.Prisma.Decimal(0)).add((0, decimal_1.dec)(m.quantity).mul(m.sens)));
    }
    return depots.map((d) => {
        const lignes = parDepot.get(d.id) ?? new Map();
        let nbLignes = 0;
        const articles = new Set();
        for (const [key, qty] of lignes) {
            if (qty.lte(0))
                continue;
            nbLignes += 1;
            articles.add(Number(key.split('|')[0]));
        }
        return { depotId: d.id, label: d.label, nbLignes, nbArticles: articles.size };
    });
}
/** Depot le moins rempli : suggestion d'accueil pour un EMPRUNT (le moins de lignes en stock). */
async function leastFilledDepot(db = prisma_1.prisma) {
    const parDepot = await depotStockTotals(db);
    if (parDepot.length === 0)
        throw (0, apiError_1.badRequest)('Aucun dépôt configuré');
    const suggested = [...parDepot].sort((a, b) => a.nbLignes - b.nbLignes || a.nbArticles - b.nbArticles || a.depotId - b.depotId)[0];
    return { suggested, parDepot };
}
/**
 * Determine le depot et l'emplacement REELS du mouvement de pret/emprunt.
 * - Si l'utilisateur les fournit, on les valide.
 * - Sinon on deduit le couple (depot, emplacement) qui detient effectivement le stock
 *   de l'article pour le lot fourni.
 * Sans ce repli, un pret porterait sur un depot/emplacement vide alors que le stock
 * est ailleurs : le controle de disponibilite de movementService renverrait alors
 * "Stock insuffisant (disponible : 0)" alors que l'article est bien en stock.
 */
async function resolveStockTarget(articleId, lotId, requested, db) {
    if (requested.depotId != null) {
        const depot = await db.depot.findUnique({ where: { id: requested.depotId }, select: { id: true } });
        if (!depot)
            throw (0, apiError_1.notFound)('Dépôt introuvable');
        if (requested.locationId != null) {
            const loc = await db.location.findUnique({ where: { id: requested.locationId }, select: { id: true } });
            if (!loc)
                throw (0, apiError_1.notFound)('Emplacement introuvable');
            return { depotId: depot.id, locationId: loc.id };
        }
        return { depotId: depot.id, locationId: null };
    }
    // Repli : premier couple (depot, emplacement) reellement stocke.
    const moves = await db.move.findMany({
        where: {
            articleId,
            status: 'ACTIF',
            ...(lotId == null ? {} : { lotId }),
        },
        select: { quantity: true, sens: true, depotId: true, locationId: true },
    });
    const totals = new Map();
    for (const m of moves) {
        const key = `${m.depotId}|${m.locationId ?? ''}`;
        const cur = totals.get(key) ?? {
            depotId: m.depotId,
            locationId: m.locationId ?? null,
            qty: new client_1.Prisma.Decimal(0),
        };
        cur.qty = cur.qty.add((0, decimal_1.dec)(m.quantity).mul(m.sens));
        totals.set(key, cur);
    }
    const stocked = [...totals.values()]
        .filter((t) => t.qty.greaterThan(0))
        .sort((a, b) => a.depotId - b.depotId || (a.locationId ?? 0) - (b.locationId ?? 0));
    const best = stocked[0];
    if (best)
        return { depotId: best.depotId, locationId: best.locationId };
    // Aucun stock : on retombe sur le premier depot (EMPRUNT = entree, pas de controle de dispo).
    const first = await db.depot.findFirst({ orderBy: { id: 'asc' }, select: { id: true } });
    if (!first)
        throw (0, apiError_1.badRequest)('Aucun dépôt configuré');
    return { depotId: first.id, locationId: null };
}
async function createLoan(data, userId) {
    // Le pret sort du stock (0.1 -> sortie), l'emprunt entre (entree).
    const loan = await prisma_1.prisma.$transaction(async (tx) => {
        const target = await resolveStockTarget(data.articleId, data.lotId ?? null, { depotId: data.depotId, locationId: data.locationId }, tx);
        const movement = await (0, movementService_1.createMovement)({
            type: data.type === client_1.LoanType.PRET ? 'SORTIE' : 'ENTREE',
            articleId: data.articleId,
            lotId: data.lotId ?? null,
            locationId: target.locationId,
            quantity: data.quantity,
            movementDate: data.loanDate,
            depotId: target.depotId,
            partnerId: data.partnerId,
            observation: data.observation ?? (data.type === client_1.LoanType.PRET ? 'PRÊT' : 'EMPRUNT'),
            // D20 : un PRET est une sortie de stock, il passe par le controle d'empietement.
            confirmToken: data.confirmToken ?? null,
        }, userId, tx);
        return tx.loan.create({
            data: {
                type: data.type,
                partnerId: data.partnerId,
                articleId: data.articleId,
                quantity: data.quantity,
                loanDate: data.loanDate,
                observation: data.observation,
                movementId: movement.id,
            },
        });
    });
    await (0, audit_1.audit)(userId, 'CREATION', 'loan', String(loan.id), {
        type: data.type,
        movementId: loan.movementId,
    });
    return loan;
}
async function createRestitution(data, userId) {
    const rest = await prisma_1.prisma.$transaction(async (tx) => {
        const balance = await loanBalance(data.loanId, tx);
        if (balance < data.quantity) {
            throw (0, apiError_1.badRequest)(`Solde restant insuffisant (reste ${balance})`);
        }
        const loan = await tx.loan.findUnique({ where: { id: data.loanId } });
        if (!loan)
            throw (0, apiError_1.notFound)('Opération de prêt/emprunt introuvable');
        // RESTITUTION_PRET : le retour reintegre le stock (entree).
        // RESTITUTION_EMPRUNT : le retour retire la marchandise empruntee (sortie).
        const moveType = data.type === client_1.RestitutionType.RESTITUTION_PRET ? 'ENTREE' : 'SORTIE';
        // La restitution doit reintegrer le stock dans le MEME depot / emplacement
        // que le pret initial (sinon le controle de disponibilite porte sur un emplacement vide).
        const origin = loan.movementId
            ? await tx.move.findUnique({
                where: { id: loan.movementId },
                select: { depotId: true, lotId: true, locationId: true },
            })
            : null;
        const lotId = origin?.lotId ?? null;
        const target = await resolveStockTarget(loan.articleId, lotId, origin ? { depotId: origin.depotId, locationId: origin.locationId } : {}, tx);
        const movement = await (0, movementService_1.createMovement)({
            type: moveType,
            articleId: loan.articleId,
            lotId,
            locationId: target.locationId,
            quantity: data.quantity,
            movementDate: data.restDate,
            depotId: target.depotId,
            partnerId: loan.partnerId,
            observation: `RESTITUTION (${data.type})`,
            // D20 : une RESTITUTION_EMPRUNT sort du stock, elle est donc controlee.
            confirmToken: data.confirmToken ?? null,
        }, userId, tx);
        return tx.loanRestitution.create({
            data: {
                loanId: data.loanId,
                type: data.type,
                quantity: data.quantity,
                restDate: data.restDate,
                movementId: movement.id,
            },
        }).then(async (created) => {
            // Mise a jour du statut : PARTIEL si solde restant, CLOTURE si solde nul.
            const agg = await tx.loanRestitution.aggregate({
                where: { loanId: data.loanId },
                _sum: { quantity: true },
            });
            const remaining = (0, decimal_1.dec)(loan.quantity).sub((0, decimal_1.dec)(agg._sum.quantity));
            await tx.loan.update({
                where: { id: data.loanId },
                data: { status: remaining.lessThanOrEqualTo(0) ? 'CLOTURE' : 'PARTIEL' },
            });
            return created;
        });
    });
    await (0, audit_1.audit)(userId, 'CREATION', 'loan_restitution', String(rest.id), {
        type: data.type,
        movementId: rest.movementId,
    });
    return rest;
}
async function listLoans() {
    const loans = await prisma_1.prisma.loan.findMany({
        include: {
            partner: true,
            article: { select: { code: true, designation: true, unit: { select: { code: true } } } },
            restitutions: true,
            move: {
                select: {
                    depotId: true,
                    locationId: true,
                    depot: { select: { label: true } },
                    location: { select: { label: true } },
                    lot: { select: { lotNumber: true } },
                },
            },
        },
        orderBy: { createdAt: 'desc' },
    });
    return loans.map((l) => {
        const restitue = l.restitutions.reduce((a, r) => a.add((0, decimal_1.dec)(r.quantity)), new client_1.Prisma.Decimal(0));
        return {
            ...l,
            // Depot / emplacement reels du mouvement : coherent avec la page Stock et les Mouvements.
            depot: l.move?.depot?.label ?? null,
            emplacement: l.move?.location?.label ?? null,
            lotNumber: l.move?.lot?.lotNumber ?? null,
            restitue: (0, decimal_1.toNumber)(restitue),
            solde: (0, decimal_1.toNumber)((0, decimal_1.dec)(l.quantity).sub(restitue)),
        };
    });
}
/**
 * Synthese en NOMBRES D'OPERATIONS (et non en quantites) :
 * - nbPret / nbEmprunt : nombre d'operations de pret / d'emprunt.
 * - nbRestituees : operations dont la restitution est COMPLETE (solde nul).
 * - nbRestitueesIncompletes : operations encore en cours de restitution (solde > 0).
 * Les deux derniers compteurs se completent : total = completes + incompletes.
 */
async function synthesis() {
    const loans = await listLoans();
    return {
        nbPret: loans.filter((l) => l.type === 'PRET').length,
        nbEmprunt: loans.filter((l) => l.type === 'EMPRUNT').length,
        nbRestituees: loans.filter((l) => l.solde <= 0).length,
        nbRestitueesIncompletes: loans.filter((l) => l.solde > 0).length,
    };
}
//# sourceMappingURL=loanService.js.map