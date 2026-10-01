import { z } from 'zod';
import { MoveTypeCode } from '@prisma/client';
import { CURRENCY_CODES } from '../utils/currencies';

export const moveTypeEnum = z.nativeEnum(MoveTypeCode);

export const movementSchema = z
  .object({
    type: moveTypeEnum,
    articleId: z.number().int().positive(),
    quantity: z.number().positive(),
    movementDate: z.coerce.date(),
    depotId: z.number().int().positive(),
    locationId: z.number().int().positive().nullish(),
    depotDestId: z.number().int().positive().nullish(),
    locationDestId: z.number().int().positive().nullish(),
    lotId: z.number().int().positive().nullish(),
    partnerId: z.number().int().positive().nullish(),
    docNumber: z.string().max(50).nullish(),
    unitPrice: z.number().nullish(),
    currency: z.enum(CURRENCY_CODES as [string, ...string[]]).nullish(),
    observation: z.string().max(255).nullish(),
    sens: z.number().int().refine((v) => v === 1 || v === -1).nullish(),
  })
  .refine((v) => v.quantity > 0, { message: 'quantité > 0' });

export const cancelSchema = z.object({
  id: z.bigint(),
});