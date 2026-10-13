"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listArticles = listArticles;
exports.getArticle = getArticle;
exports.createArticle = createArticle;
exports.updateArticle = updateArticle;
exports.setArticlePrice = setArticlePrice;
exports.deleteArticle = deleteArticle;
exports.monthlyConsumption = monthlyConsumption;
const prisma_1 = require("../prisma");
const client_1 = require("@prisma/client");
const codeSeries_1 = require("../utils/codeSeries");
const apiError_1 = require("../utils/apiError");
const audit_1 = require("../utils/audit");
const decimal_1 = require("../utils/decimal");
const ARTICLE_INCLUDE = {
    category: true,
    family: true,
    unit: true,
    origin: true,
    packaging: true,
};
async function listArticles(filters) {
    const where = {};
    if (filters.search) {
        where.OR = [
            { designation: { contains: filters.search, mode: 'insensitive' } },
            { code: { contains: filters.search } },
        ];
    }
    if (filters.categoryId)
        where.categoryId = filters.categoryId;
    if (filters.familyId)
        where.familyId = filters.familyId;
    if (filters.statut)
        where.statut = filters.statut;
    // `code` est UNIQUE en base : le tri par code est donc total et la pagination ne
    // peut pas faire sauter ni repeter un article entre deux pages.
    if (filters.limit === undefined) {
        const items = await prisma_1.prisma.article.findMany({ where, include: ARTICLE_INCLUDE, orderBy: { code: 'asc' } });
        return { items, total: items.length };
    }
    const [total, items] = await prisma_1.prisma.$transaction([
        prisma_1.prisma.article.count({ where }),
        prisma_1.prisma.article.findMany({
            where,
            include: ARTICLE_INCLUDE,
            orderBy: { code: 'asc' },
            take: filters.limit,
            skip: filters.offset ?? 0,
        }),
    ]);
    return { items, total };
}
async function getArticle(id) {
    const article = await prisma_1.prisma.article.findUnique({
        where: { id },
        include: { category: true, family: true, unit: true, origin: true, packaging: true },
    });
    if (!article)
        throw (0, apiError_1.notFound)('Article introuvable');
    return article;
}
async function createArticle(data, userId) {
    const categoryId = data.category.connect
        .id;
    const article = await prisma_1.prisma.$transaction(async (tx) => {
        const code = await (0, codeSeries_1.nextArticleCode)(categoryId, tx);
        return tx.article.create({
            data: { ...data, code },
        });
    });
    await (0, audit_1.audit)(userId, 'CREATION', 'article', String(article.id), { code: article.code });
    return article;
}
async function updateArticle(id, data, userId) {
    const before = await prisma_1.prisma.article.findUnique({ where: { id } });
    if (!before)
        throw (0, apiError_1.notFound)('Article introuvable');
    // INVARIANT UNITE : l'unite de mesure est portee par l'article et ne doit JAMAIS
    // changer des qu'il existe des mouvements : sinon tout le stock historique passerait
    // silencieusement de KG a L, et une somme d'quantites comparerait deux unites differentes.
    const targetUnitId = data.unit?.connect?.id;
    if (targetUnitId != null && targetUnitId !== before.unitId) {
        const [nbMouvements, nbLots] = await Promise.all([
            prisma_1.prisma.move.count({ where: { articleId: id } }),
            prisma_1.prisma.lot.count({ where: { articleId: id } }),
        ]);
        if (nbMouvements > 0 || nbLots > 0) {
            throw (0, apiError_1.badRequest)("Impossible de changer l'unité de mesure : cet article a déjà des mouvements de stock" +
                (nbLots > 0 ? ' et des lots' : '') +
                '. Les quantités sont exprimées dans son unité actuelle. Créez un nouvel article avec la bonne unité.');
        }
    }
    const article = await prisma_1.prisma.article.update({ where: { id }, data });
    await (0, audit_1.audit)(userId, 'MODIFICATION', 'article', String(id), { before, after: article });
    return article;
}
async function setArticlePrice(id, unitPrice, currency, userId) {
    const cur = currency ?? 'DZD';
    const article = await prisma_1.prisma.$transaction(async (tx) => {
        const updated = await tx.article.update({
            where: { id },
            data: { unitPrice, currency: cur },
        });
        await tx.priceHistory.create({
            data: { articleId: id, unitPrice, currency: cur, changedBy: userId },
        });
        return updated;
    });
    await (0, audit_1.audit)(userId, 'MODIFICATION', 'article', String(id), {
        action: 'PRIX',
        unitPrice,
        currency: cur,
    });
    return article;
}
/**
 * Suppression TOTALE d'un article. Autorisee UNIQUEMENT si l'article ne figure
 * dans aucun dépôt : aucun mouvement actif (stock disponible) ne doit exister.
 * Les references restantes (lots, mouvements annules, bons, prets, commandes,
 * inventaires...) bloquent la suppression (P2003 -> 409).
 */
async function deleteArticle(id, userId) {
    const article = await prisma_1.prisma.article.findUnique({ where: { id } });
    if (!article)
        throw (0, apiError_1.notFound)('Article introuvable');
    const activeMoves = await prisma_1.prisma.move.count({
        where: { articleId: id, status: 'ACTIF' },
    });
    if (activeMoves > 0) {
        throw (0, apiError_1.conflict)('Suppression impossible : cet article figure encore dans des dépôts (mouvements actifs / stock disponible).');
    }
    // Les mouvements ANNULÉS ne comptent pas dans le stock (aucun dépôt) : on les purge
    // pour autoriser la suppression, sans toucher aux mouvements ACTIFS (deja verifies).
    const annuleIds = (await prisma_1.prisma.move.findMany({
        where: { articleId: id, status: 'ANNULE' },
        select: { id: true },
    })).map((m) => m.id);
    try {
        const deleted = await prisma_1.prisma.$transaction(async (tx) => {
            if (annuleIds.length) {
                // Detache les moities liées (self reference) avant purge.
                await tx.move.updateMany({
                    where: { OR: [{ id: { in: annuleIds } }, { linkMoveId: { in: annuleIds } }] },
                    data: { linkMoveId: null },
                });
                await tx.move.deleteMany({ where: { id: { in: annuleIds } } });
            }
            await tx.priceHistory.deleteMany({ where: { articleId: id } });
            return tx.article.delete({ where: { id } });
        });
        await (0, audit_1.audit)(userId, 'SUPPRESSION', 'article', String(id), {
            code: article.code,
            designation: article.designation,
            purgedMoves: annuleIds.length,
        });
        return deleted;
    }
    catch (e) {
        if (e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
            throw (0, apiError_1.conflict)('Suppression impossible : cet article est utilisé par des lots, mouvements, bons, prêts, commandes ou inventaires.');
        }
        throw e;
    }
}
/** Consommation mensuelle des 12 derniers mois, calculee depuis les SORTIES (D3). */
async function monthlyConsumption(articleId, months = 12) {
    const from = new Date();
    from.setMonth(from.getMonth() - months + 1);
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
    const moves = await prisma_1.prisma.move.findMany({
        where: {
            articleId,
            status: 'ACTIF',
            type: { code: 'SORTIE' },
            movementDate: { gte: from },
        },
        select: { quantity: true, sens: true, movementDate: true },
    });
    const perMonth = new Map();
    for (const m of moves) {
        // movementDate est une colonne @db.Date : Prisma la renvoie a minuit UTC. Le
        // regroupement se fait donc en UTC, sinon une sortie datee du 1er du mois
        // serait rattachee au mois precedent sur un serveur en decalage negatif.
        const key = `${m.movementDate.getUTCFullYear()}${String(m.movementDate.getUTCMonth() + 1).padStart(2, '0')}`;
        perMonth.set(key, (perMonth.get(key) ?? new client_1.Prisma.Decimal(0)).add((0, decimal_1.dec)(m.quantity)));
    }
    const values = Array.from(perMonth.values());
    const count = values.length;
    const sum = values.reduce((a, b) => a.add(b), new client_1.Prisma.Decimal(0));
    const breakdown = {};
    for (const [k, v] of perMonth)
        breakdown[k] = (0, decimal_1.toNumber)(v);
    return {
        months: count,
        cMax: count ? (0, decimal_1.toNumber)(values.reduce((a, b) => (b.greaterThan(a) ? b : a))) : 0,
        avg: count ? (0, decimal_1.toNumber)(sum.div(count), 3) : 0,
        breakdown,
    };
}
//# sourceMappingURL=articleService.js.map