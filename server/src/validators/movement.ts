import { z } from 'zod';
import { MoveTypeCode } from '@prisma/client';
import { CURRENCY_CODES } from '../utils/currencies';

export const moveTypeEnum = z.nativeEnum(MoveTypeCode);

/** Natures proposees pour un ajustement NEGATIF (sortie de stock). */
export const ADJUST_NATURES = ['PERTE', 'VOLE', 'REBUT', 'CASSE', 'AUCUN'] as const;

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
        message: 'La nature est obligatoire pour un ajustement négatif (PERTE, VOLE, REBUT, CASSE, AUCUN).',
      });
    }
    // La nature « AUCUN » designe un ajustement non qualifie : le motif devient
    // facultatif, la nature suffit alors a identifier la ligne. Pour les autres
    // natures (perte, vol, rebut, casse), le motif reste exige.
    if (v.adjustNature !== 'AUCUN' && !v.adjustMotif) {
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
 * Annulation d'un mouvement. Deux confirmations distinctes peuvent etre exigees :
 *   - `linkConfirmToken` : le mouvement est lie a un pret/emprunt, une restitution,
 *     une validation de reservation ou un inventaire, et l'annulation va corriger
 *     ce document (ou le supprimer) ;
 *   - `confirmToken` : l'annulation retire du stock et peut generer un stock negatif
 *     ou empieter sur une reservation ACTIF (meme controle que la creation).
 * Les deux jetons sont signes et lies a l'operation ; le client peut donc en avoir
 * un, l'autre, ou les deux au moment du rejeu.
 */
export const cancelMovementSchema = z.object({
  confirmToken: z.string().max(4000).nullish(),
  linkConfirmToken: z.string().max(4000).nullish(),
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
 * Modification d'une ligne de mouvement DEJA ENREGISTREE (administrateur uniquement).
 *
 * Meme forme que la creation pour que le client renvoie la ligne complete, mais le
 * service verifie que les champs qui determinent le stock (type, sens, article,
 * quantite, lot, depot, emplacements) sont STRICTEMENT inchanges. Ils sont figes :
 * une correction ne doit pas etre traitee comme une nouvelle ecriture de stock.
 * `confirmToken` n'a donc plus d'effet sur la modification.
 */
export const movementUpdateSchema = movementSchema;