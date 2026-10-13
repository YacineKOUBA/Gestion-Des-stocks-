"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.referentialSchema = exports.priceSchema = exports.articleUpdateSchema = exports.articleSchema = void 0;
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const currencies_1 = require("../utils/currencies");
exports.articleSchema = zod_1.z.object({
    designation: zod_1.z.string().min(1).max(200),
    designation2: zod_1.z.string().max(200).nullish(),
    fabricant: zod_1.z.string().max(100).nullish(),
    emploiGd: zod_1.z.nativeEnum(client_1.ArticleEmploi).default(client_1.ArticleEmploi.PRODUCTION),
    categoryId: zod_1.z.number().int().positive(),
    familyId: zod_1.z.number().int().positive().nullish(),
    application: zod_1.z.string().max(150).nullish(),
    unitId: zod_1.z.number().int().positive(),
    packagingId: zod_1.z.number().int().positive().nullish(),
    sourceAchat: zod_1.z.nativeEnum(client_1.SourceAchat).nullish(),
    originId: zod_1.z.number().int().positive().nullish(),
    periode: zod_1.z.string().max(20).nullish(),
    frequence: zod_1.z.number().int().positive().nullish(),
    statut: zod_1.z.nativeEnum(client_1.ArticleStatut).default(client_1.ArticleStatut.ACTIVE),
    unitPrice: zod_1.z.number().nullish(),
    isLotTracked: zod_1.z.boolean().default(false),
    currency: zod_1.z.enum(currencies_1.CURRENCY_CODES).nullish(),
});
exports.articleUpdateSchema = exports.articleSchema.partial();
exports.priceSchema = zod_1.z.object({
    unitPrice: zod_1.z.number().nonnegative(),
    currency: zod_1.z.enum(currencies_1.CURRENCY_CODES).default(currencies_1.DEFAULT_CURRENCY),
});
exports.referentialSchema = zod_1.z.object({
    code: zod_1.z.string().min(1).max(20),
    label: zod_1.z.string().min(1).max(100),
    categoryId: zod_1.z.number().int().positive().nullish(),
});
//# sourceMappingURL=article.js.map