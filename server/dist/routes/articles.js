"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const articleService = __importStar(require("../services/articleService"));
const parse_1 = require("../utils/parse");
const article_1 = require("../validators/article");
const permissions_1 = require("../middlewares/permissions");
const router = (0, express_1.Router)();
// Plafond dur de pagination : il protege la base, il n'empeche pas l'affichage
// correct car le total reel est toujours renvoye dans X-Total-Count.
const MAX_LIMIT = 500;
router.get('/', (0, permissions_1.requirePermission)('article:read'), async (req, res) => {
    const q = req.query;
    // Pagination VOLONTAIRE : sans `limit` on renvoie tout le catalogue, parce que
    // les listes deroulantes des bons, reservations, prets et lots ont besoin de
    // l'integralite des articles. Seule la page Article demande des pages de 75.
    const limitRaw = q.limit === undefined ? Number.NaN : Number(q.limit);
    const offsetRaw = Number(q.offset);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.min(Math.max(Math.trunc(limitRaw), 1), MAX_LIMIT)
        : undefined;
    const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.trunc(offsetRaw) : 0;
    const { items, total } = await articleService.listArticles({
        search: q.search,
        categoryId: q.categoryId ? Number(q.categoryId) : undefined,
        familyId: q.familyId ? Number(q.familyId) : undefined,
        statut: q.statut,
        limit,
        offset,
    });
    res.setHeader('X-Total-Count', String(total));
    if (limit !== undefined) {
        res.setHeader('X-Limit', String(limit));
        res.setHeader('X-Offset', String(offset));
    }
    res.json(items);
});
router.get('/:id', (0, permissions_1.requirePermission)('article:read'), async (req, res) => {
    res.json(await articleService.getArticle(Number(req.params.id)));
});
router.get('/:id/consumption', (0, permissions_1.requirePermission)('article:read'), async (req, res) => {
    res.json(await articleService.monthlyConsumption(Number(req.params.id)));
});
router.post('/', (0, permissions_1.requirePermission)('article:write'), async (req, res) => {
    const data = (0, parse_1.parse)(article_1.articleSchema, req.body);
    const article = await articleService.createArticle({
        designation: data.designation,
        designation2: data.designation2,
        fabricant: data.fabricant,
        emploiGd: data.emploiGd,
        application: data.application,
        sourceAchat: data.sourceAchat,
        periode: data.periode,
        frequence: data.frequence,
        statut: data.statut,
        unitPrice: data.unitPrice,
        currency: data.currency ?? 'DZD',
        isLotTracked: data.isLotTracked,
        category: { connect: { id: data.categoryId } },
        unit: { connect: { id: data.unitId } },
        ...(data.familyId ? { family: { connect: { id: data.familyId } } } : {}),
        ...(data.packagingId ? { packaging: { connect: { id: data.packagingId } } } : {}),
        ...(data.originId ? { origin: { connect: { id: data.originId } } } : {}),
    }, req.user.id);
    res.status(201).json(article);
});
router.put('/:id', (0, permissions_1.requirePermission)('article:write'), async (req, res) => {
    const id = Number(req.params.id);
    const data = (0, parse_1.parse)(article_1.articleUpdateSchema, req.body);
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const input = {};
    if (data.designation !== undefined)
        input.designation = data.designation;
    if (data.designation2 !== undefined)
        input.designation2 = data.designation2;
    if (data.fabricant !== undefined)
        input.fabricant = data.fabricant;
    if (data.emploiGd !== undefined)
        input.emploiGd = data.emploiGd;
    if (data.application !== undefined)
        input.application = data.application;
    if (data.sourceAchat !== undefined)
        input.sourceAchat = data.sourceAchat;
    if (data.periode !== undefined)
        input.periode = data.periode;
    if (data.frequence !== undefined)
        input.frequence = data.frequence;
    if (data.statut !== undefined)
        input.statut = data.statut;
    if (data.unitPrice !== undefined)
        input.unitPrice = data.unitPrice;
    if (data.currency !== undefined)
        input.currency = data.currency;
    if (data.isLotTracked !== undefined)
        input.isLotTracked = data.isLotTracked;
    if (data.categoryId !== undefined)
        input.category = { connect: { id: data.categoryId } };
    if (data.unitId !== undefined)
        input.unit = { connect: { id: data.unitId } };
    if (data.familyId !== undefined)
        input.family = data.familyId ? { connect: { id: data.familyId } } : { disconnect: true };
    if (data.packagingId !== undefined)
        input.packaging = data.packagingId ? { connect: { id: data.packagingId } } : { disconnect: true };
    if (data.originId !== undefined)
        input.origin = data.originId ? { connect: { id: data.originId } } : { disconnect: true };
    res.json(await articleService.updateArticle(id, input, req.user.id));
});
router.put('/:id/price', (0, permissions_1.requirePermission)('article:write'), async (req, res) => {
    const { unitPrice, currency } = (0, parse_1.parse)(article_1.priceSchema, req.body);
    res.json(await articleService.setArticlePrice(Number(req.params.id), unitPrice, currency, req.user.id));
});
// Suppression totale d'un article (autorisée uniquement s'il ne figure dans aucun dépôt).
router.delete('/:id', (0, permissions_1.requirePermission)('article:write'), async (req, res) => {
    res.json(await articleService.deleteArticle(Number(req.params.id), req.user.id));
});
exports.default = router;
//# sourceMappingURL=articles.js.map