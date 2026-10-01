import { z } from 'zod';
import {
  ArticleEmploi,
  ArticleStatut,
  SourceAchat,
} from '@prisma/client';
import { CURRENCY_CODES, DEFAULT_CURRENCY } from '../utils/currencies';

export const articleSchema = z.object({
  designation: z.string().min(1).max(200),
  designation2: z.string().max(200).nullish(),
  fabricant: z.string().max(100).nullish(),
  emploiGd: z.nativeEnum(ArticleEmploi).default(ArticleEmploi.PRODUCTION),
  categoryId: z.number().int().positive(),
  familyId: z.number().int().positive().nullish(),
  application: z.string().max(150).nullish(),
  unitId: z.number().int().positive(),
  packagingId: z.number().int().positive().nullish(),
  sourceAchat: z.nativeEnum(SourceAchat).nullish(),
  originId: z.number().int().positive().nullish(),
  periode: z.string().max(20).nullish(),
  frequence: z.number().int().positive().nullish(),
  statut: z.nativeEnum(ArticleStatut).default(ArticleStatut.ACTIVE),
  unitPrice: z.number().nullish(),
  isLotTracked: z.boolean().default(false),
  currency: z.enum(CURRENCY_CODES as [string, ...string[]]).nullish(),
});

export const articleUpdateSchema = articleSchema.partial();

export const priceSchema = z.object({
  unitPrice: z.number().nonnegative(),
  currency: z.enum(CURRENCY_CODES as [string, ...string[]]).default(DEFAULT_CURRENCY),
});

export const referentialSchema = z.object({
  code: z.string().min(1).max(20),
  label: z.string().min(1).max(100),
  categoryId: z.number().int().positive().nullish(),
});