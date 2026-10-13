"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nextArticleCode = nextArticleCode;
const prisma_1 = require("../prisma");
const apiError_1 = require("./apiError");
/**
 * Genere le prochain code article selon la serie de la categorie (ex. 100001).
 * Doit etre appele dans une transaction fournie par l'appelant pour que
 * l'increment de serie et la creation de l'article soient atomiques.
 * Le compteur est verrouille (FOR UPDATE) pour eviter les doublons concurrents.
 */
async function nextArticleCode(categoryId, db = prisma_1.prisma) {
    await db.$queryRaw `SELECT id FROM "CodeSeries" WHERE "categoryId" = ${categoryId} FOR UPDATE`;
    const series = await db.codeSeries.findUnique({ where: { categoryId } });
    if (!series) {
        throw (0, apiError_1.conflict)(`Pas de série de codes pour la catégorie ${categoryId}`);
    }
    const width = series.digits - series.prefix.length;
    const body = String(series.nextValue).padStart(width, '0');
    const code = `${series.prefix}${body}`;
    await db.codeSeries.update({
        where: { id: series.id },
        data: { nextValue: series.nextValue + 1 },
    });
    return code;
}
//# sourceMappingURL=codeSeries.js.map