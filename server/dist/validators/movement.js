"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reactivateSchema = exports.cancelSchema = exports.movementSchema = exports.moveTypeEnum = void 0;
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const currencies_1 = require("../utils/currencies");
exports.moveTypeEnum = zod_1.z.nativeEnum(client_1.MoveTypeCode);
exports.movementSchema = zod_1.z
    .object({
    type: exports.moveTypeEnum,
    articleId: zod_1.z.number().int().positive(),
    quantity: zod_1.z.number().positive(),
    movementDate: zod_1.z.coerce.date(),
    depotId: zod_1.z.number().int().positive(),
    locationId: zod_1.z.number().int().positive().nullish(),
    depotDestId: zod_1.z.number().int().positive().nullish(),
    locationDestId: zod_1.z.number().int().positive().nullish(),
    lotId: zod_1.z.number().int().positive().nullish(),
    partnerId: zod_1.z.number().int().positive().nullish(),
    docNumber: zod_1.z.string().max(50).nullish(),
    unitPrice: zod_1.z.number().nullish(),
    currency: zod_1.z.enum(currencies_1.CURRENCY_CODES).nullish(),
    observation: zod_1.z.string().max(255).nullish(),
    sens: zod_1.z.number().int().refine((v) => v === 1 || v === -1).nullish(),
    // D20, decision 7 : jeton de confirmation d'un empietement sur stock reserve.
    // Absent ou invalide => l'ecriture est refusee (409) avec le detail du conflit.
    confirmToken: zod_1.z.string().max(4000).nullish(),
})
    .refine((v) => v.quantity > 0, { message: 'quantité > 0' });
exports.cancelSchema = zod_1.z.object({
    id: zod_1.z.bigint(),
});
/**
 * D20, decision 7 : la reactivation d'un mouvement qui retire du stock repasse par le
 * meme controle d'empietement que la creation, donc par le meme jeton signe. Absent
 * ou invalide => la reactivation est refusee (409) avec le detail du conflit.
 */
exports.reactivateSchema = zod_1.z.object({
    confirmToken: zod_1.z.string().max(4000).nullish(),
});
//# sourceMappingURL=movement.js.map