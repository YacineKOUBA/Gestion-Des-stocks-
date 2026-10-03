import { z } from 'zod';
import {
  InventoryDecision,
  LoanType,
  RestitutionType,
} from '@prisma/client';
import { CURRENCY_CODES, DEFAULT_CURRENCY } from '../utils/currencies';

export const loginSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
});

export const userCreateSchema = z.object({
  login: z.string().min(3).max(50),
  password: z.string().min(6),
  displayName: z.string().max(100).nullish(),
  roleId: z.number().int().positive(),
});

export const userUpdateSchema = z.object({
  displayName: z.string().max(100).nullish(),
  password: z.string().min(6).nullish(),
  isActive: z.boolean().nullish(),
});

export const loanSchema = z.object({
  type: z.nativeEnum(LoanType),
  partnerId: z.number().int().positive(),
  articleId: z.number().int().positive(),
  lotId: z.number().int().positive().nullish(),
  depotId: z.number().int().positive().nullish(),
  locationId: z.number().int().positive().nullish(),
  quantity: z.number().positive(),
  loanDate: z.coerce.date(),
  observation: z.string().max(255).nullish(),
  // D20, decision 4 : un PRET sort du stock, il est donc soumis au controle
  // d'empietement sur stock reserve et accepte un jeton de confirmation.
  confirmToken: z.string().max(4000).nullish(),
});

export const restitutionSchema = z.object({
  loanId: z.coerce.bigint(),
  type: z.nativeEnum(RestitutionType),
  quantity: z.number().positive(),
  restDate: z.coerce.date(),
  // RESTITUTION_EMPRUNT sort du stock : meme controle d'empietement que le pret.
  confirmToken: z.string().max(4000).nullish(),
});

export const inventoryOpenSchema = z.object({
  title: z.string().max(150).nullish(),
  depotId: z.number().int().positive(),
});

export const inventoryCountSchema = z.object({
  qtyCounted: z.number().nonnegative(),
});

export const inventoryValidateSchema = z.object({
  decision: z.nativeEnum(InventoryDecision),
  lossReason: z.string().max(150).nullish(),
  // D20, decision 4 : la cloture d'inventaire retire du stock (PERTE, ou
  // AJUSTEMENT negatif), elle est donc soumise au controle d'empietement.
  confirmToken: z.string().max(4000).nullish(),
});

export const bonSchema = z.object({
  type: z.enum(['ENTREE', 'SORTIE', 'LIVRAISON', 'TRANSFERT', 'RETOUR']),
  depotId: z.number().int().positive().nullish(),
  depotDestId: z.number().int().positive().nullish(),
  partnerId: z.number().int().positive().nullish(),
  bonDate: z.coerce.date(),
  currency: z.enum(CURRENCY_CODES as [string, ...string[]]).default(DEFAULT_CURRENCY),
  lines: z
    .array(
      z.object({
        articleId: z.number().int().positive(),
        lotId: z.number().int().positive().nullish(),
        quantity: z.number().positive(),
        unitPrice: z.number().nonnegative().nullish(),
        observation: z.string().max(255).nullish(),
      }),
    )
    .min(1),
});

export const reservationSchema = z.object({
  partnerId: z.number().int().positive(),
  // Personnel libre : il peut ne correspondre a aucun utilisateur de l'application.
  staffLabel: z.string().trim().min(1).max(100),
  staffId: z.number().int().positive().nullish(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  observation: z.string().max(255).nullish(),
  lines: z
    .array(
      z.object({
        articleId: z.number().int().positive(),
        quantity: z.number().positive(),
      }),
    )
    .min(1),
});

export const settingsSchema = z.record(z.string().min(1), z.string().min(1));

export const lotSchema = z.object({
  articleId: z.number().int().positive(),
  lotNumber: z.string().min(1).max(100),
  fabricDate: z.coerce.date().nullish(),
  expiryDate: z.coerce.date().nullish(),
  unitPrice: z.number().nonnegative().nullish(),
  currency: z.enum(CURRENCY_CODES as [string, ...string[]]).nullish(),
  observation: z.string().max(2000).nullish(),
});

// Schema partiel pour la modification d'un lot existant : tous les champs sont optionnels,
// seuls ceux fournis sont mis a jour. observation inclus pour pouvoir editer ce champ.
export const lotUpdateSchema = lotSchema.partial();