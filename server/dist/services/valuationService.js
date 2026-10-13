"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.valuation = valuation;
const prisma_1 = require("../prisma");
const stockService_1 = require("./stockService");
const client_1 = require("@prisma/client");
const decimal_1 = require("../utils/decimal");
const lotFlag_1 = require("../utils/lotFlag");
async function valuation(filters) {
    // Stock regroupé PAR LOT : chaque lot est valorise a SON prix unitaire, saisi a sa creation
    // et suivi pendant toute sa duree de vie. Le prix de l'article n'est utilise que comme
    // repli, pour les lots qui n'ont pas de prix propre.
    const rows = await (0, stockService_1.stockRows)({ group: 'lot', ...filters });
    const ids = [...new Set(rows.map((r) => r.articleId))];
    const lotIds = [...new Set(rows.map((r) => r.lotId).filter((x) => x != null))];
    const [articles, lots] = await Promise.all([
        ids.length
            ? prisma_1.prisma.article.findMany({
                where: { id: { in: ids } },
                select: { id: true, unitPrice: true, currency: true },
            })
            : Promise.resolve([]),
        lotIds.length
            ? prisma_1.prisma.lot.findMany({
                where: { id: { in: lotIds } },
                select: { id: true, unitPrice: true },
            })
            : Promise.resolve([]),
    ]);
    const priceById = new Map(articles.map((a) => [a.id, (0, decimal_1.dec)(a.unitPrice)]));
    const currencyById = new Map(articles.map((a) => [a.id, a.currency]));
    const lotPriceById = new Map(lots.filter((l) => l.unitPrice != null).map((l) => [l.id, (0, decimal_1.dec)(l.unitPrice)]));
    const acc = new Map();
    for (const r of rows) {
        // Prix propre au lot s'il en a un, sinon prix de l'article (le prix de l'article ne sert
        // QUE de repli : des qu'un lot a son propre prix, c'est ce dernier qui le remplace).
        const lotPrice = r.lotId != null ? lotPriceById.get(r.lotId) : undefined;
        const price = lotPrice ?? priceById.get(r.articleId) ?? new client_1.Prisma.Decimal(0);
        const qty = (0, decimal_1.dec)(r.quantity);
        const currency = currencyById.get(r.articleId) ?? 'DZD';
        const value = qty.mul(price);
        // Detail du calcul : une ligne par lot, avec le prix qui lui est effectivement applique.
        const detail = {
            lotId: r.lotId ?? null,
            lotNumber: r.lot ?? null,
            expiryDate: r.expiryDate ?? null,
            flag: (0, lotFlag_1.lotFlag)(r.expiryDate),
            quantity: (0, decimal_1.toNumber)(qty),
            unitPrice: (0, decimal_1.toNumber)(price, 4),
            priceSource: lotPrice ? 'LOT' : 'ARTICLE',
            value: (0, decimal_1.toNumber)(value, 4),
        };
        const cur = acc.get(r.articleId);
        if (cur) {
            cur.quantity = cur.quantity.add(qty);
            cur.value = cur.value.add(value);
            cur.lots.push(detail);
        }
        else {
            acc.set(r.articleId, {
                articleId: r.articleId,
                code: r.articleCode,
                designation: r.designation,
                category: r.category,
                family: r.family,
                unit: r.unit,
                currency,
                quantity: qty,
                value,
                lots: [detail],
            });
        }
    }
    const totals = {};
    const result = Array.from(acc.values())
        .map((a) => {
        const qty = (0, decimal_1.toNumber)(a.quantity);
        const valueNum = (0, decimal_1.toNumber)(a.value, 4);
        totals[a.currency] = (totals[a.currency] ?? new client_1.Prisma.Decimal(0)).add((0, decimal_1.dec)(a.value));
        return {
            articleId: a.articleId,
            articleCode: a.code,
            designation: a.designation,
            category: a.category,
            family: a.family,
            unit: a.unit,
            quantity: qty,
            // Prix moyen pondere du stock : somme(pu du lot x qte du lot) / qte totale de l'article.
            // Les lots peuvent avoir des prix differents ; le prix de l'article n'intervient que
            // pour les lots qui n'ont pas de prix propre.
            unitPrice: qty !== 0 ? (0, decimal_1.toNumber)(a.value.div(a.quantity), 4) : 0,
            currency: a.currency,
            value: valueNum,
            // Lots ordonnes par peremption (FEFO) : les plus proches de la date limite en tete.
            lots: [...a.lots].sort((x, y) => {
                const ex = x.expiryDate ? new Date(x.expiryDate).getTime() : Number.POSITIVE_INFINITY;
                const ey = y.expiryDate ? new Date(y.expiryDate).getTime() : Number.POSITIVE_INFINITY;
                if (ex !== ey)
                    return ex - ey;
                return (x.lotNumber ?? '').localeCompare(y.lotNumber ?? '');
            }),
        };
    })
        .sort((x, y) => x.articleCode.localeCompare(y.articleCode));
    return {
        rows: result,
        totals: Object.fromEntries(Object.entries(totals).map(([c, v]) => [c, (0, decimal_1.toNumber)(v, 4)])),
    };
}
//# sourceMappingURL=valuationService.js.map