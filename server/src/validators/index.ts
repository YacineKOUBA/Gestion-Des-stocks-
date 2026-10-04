import { z } from 'zod';
import {
  InventoryDecision,
  LoanType,
  RestitutionType,
} from '@prisma/client';
import { CURRENCY_CODES, DEFAULT_CURRENCY } from '../utils/currencies';
import { PLAFOND_CODE } from '../services/reservationStock';

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

/**
 * D21 : le plafond de reservation est un pourcentage, pas un texte libre.
 *
 * `plafondPct` se rabat silencieusement sur 15 % si la valeur n'est pas un nombre
 * dans ]0, 100]. C'est une bonne protection contre une valeur corrompue, mais
 * c'est aussi une Valerie de Constance : taper « 15,5 » — la virgule est naturelle
 * en francais — produisait NaN, donc un plafond qui restait a 15 % alors que
 * l'ecran affichait « Parametres enregistres ». Le directeur croyait avoir change
 * la regle, et elle n'avait pas bouge.
 *
 * On refuse donc explicitement ce qui n'est pas un pourcentage utilisable, plutot
 * que de l'enregistrer et de l'ignorer. La virgule est rejetee volontairement : les
 * valeurs en base utilisent le point, et convertir introduirait deux formats
 * cohabitant pour le meme parametre.
 */
const POURCENTAGE = /^\d{1,3}(\.\d{1,4})?$/;

/**
 * Message d'explication si la valeur n'est pas un pourcentage utilisable, `null`
 * sinon.
 *
 * Ce controle est appele par la route AVANT le schema, parce que le gestionnaire
 * d'erreurs ne remonte a l'ecran que « Donnees invalides » : un refus sans motif
 * serait precisement le piege qu'on cherche a eviter, l'utilisateur ne saurait pas
 * quel champ est en cause ni ce qu'il attendait.
 */
export function checkPlafondPct(value: unknown): string | null {
  if (value === undefined) return null;
  if (typeof value !== 'string') {
    return 'Le plafond doit être un pourcentage, par exemple 15 ou 12.5.';
  }
  const brut = value.trim();
  if (!POURCENTAGE.test(brut)) {
    return (
      'Le plafond doit être un pourcentage, par exemple 15 ou 12.5 (point décimal, ' +
      'la virgule est refusée : elle rendrait le réglage sans effet).'
    );
  }
  const n = Number(brut);
  if (n <= 0 || n > 100) return 'Le plafond doit être compris entre 0 (exclu) et 100.';
  return null;
}

export const settingsSchema = z
  .record(z.string().min(1), z.string().min(1))
  .superRefine((data, ctx) => {
    if (!(PLAFOND_CODE in data)) return;
    const message = checkPlafondPct(data[PLAFOND_CODE]);
    if (message) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [PLAFOND_CODE], message });
    }
  });

/** D21 : dispense du plafond, accordee par la direction generale. */
export const plafondExemptSchema = z.object({
  plafondExempt: z.boolean(),
});

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