import { z } from 'zod';
import { MoveTypeCode } from '@prisma/client';
import { CURRENCY_CODES } from '../utils/currencies';

export const moveTypeEnum = z.nativeEnum(MoveTypeCode);

/** Natures proposees pour un ajustement NEGATIF (sortie de stock). */
export const ADJUST_NATURES = ['PERTE', 'VOLE', 'CASSE'] as const;

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
    // Ajustement negatif : la nature et le motif remplacent l'observation libre
    // dans le formulaire. Ils sont exiges ci-dessous pour ce seul cas.
    adjustNature: z.enum(ADJUST_NATURES).nullish(),
    adjustMotif: z.string().trim().max(255).nullish(),
    // D20, decision 7 : jeton de confirmation d'un empietement sur stock reserve.
    // Absent ou invalide => l'ecriture est refusee (409) avec le detail du conflit.
    confirmToken: z.string().max(4000).nullish(),
  })
  .refine((v) => v.quantity > 0, { message: 'quantité > 0' })
  .superRefine((v, ctx) => {
    // Un ajustement negatif retire du stock : il doit etre qualifie. La cloture
    // d'inventaire, qui cree aussi des AJUSTEMENT negatifs en interne, ne passe
    // pas par ce schema et n'est donc pas concernee.
    if (v.type !== MoveTypeCode.AJUSTEMENT || v.sens !== -1) return;
    if (!v.adjustNature) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['adjustNature'],
        message: 'La nature est obligatoire pour un ajustement négatif (PERTE, VOLE, CASSE).',
      });
    }
    if (!v.adjustMotif) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['adjustMotif'],
        message: 'Le motif est obligatoire pour un ajustement négatif.',
      });
    }
  });

export const cancelSchema = z.object({
  id: z.bigint(),
});

/**
 * D20, decision 7 : la reactivation d'un mouvement qui retire du stock repasse par le
 * meme controle d'empietement que la creation, donc par le meme jeton signe. Absent
 * ou invalide => la reactivation est refusee (409) avec le detail du conflit.
 */
export const reactivateSchema = z.object({
  confirmToken: z.string().max(4000).nullish(),
});

/**
 * Modification d'une ligne de mouvement existante (administrateur uniquement).
 *
 * Meme forme que la creation : toutes les colonnes saisissables sont reprises, et
 * changer le type recalcule le sens. `confirmToken` couvre le meme besoin qu'a la
 * creation — une correction qui retire du stock peut mordre une reservation ACTIF
 * (D20) et le serveur renvoie alors le meme jeton signe.
 */
export const movementUpdateSchema = movementSchema;