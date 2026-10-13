"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lotUpdateSchema = exports.lotSchema = exports.plafondExemptSchema = exports.settingsSchema = exports.reservationSchema = exports.bonSchema = exports.inventoryValidateSchema = exports.inventoryCountSchema = exports.inventoryOpenSchema = exports.restitutionSchema = exports.loanSchema = exports.userUpdateSchema = exports.userCreateSchema = exports.loginSchema = void 0;
exports.checkPlafondPct = checkPlafondPct;
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const currencies_1 = require("../utils/currencies");
const reservationStock_1 = require("../services/reservationStock");
exports.loginSchema = zod_1.z.object({
    login: zod_1.z.string().min(1),
    password: zod_1.z.string().min(1),
});
exports.userCreateSchema = zod_1.z.object({
    login: zod_1.z.string().min(3).max(50),
    password: zod_1.z.string().min(6),
    displayName: zod_1.z.string().max(100).nullish(),
    roleId: zod_1.z.number().int().positive(),
});
exports.userUpdateSchema = zod_1.z.object({
    displayName: zod_1.z.string().max(100).nullish(),
    password: zod_1.z.string().min(6).nullish(),
    isActive: zod_1.z.boolean().nullish(),
});
exports.loanSchema = zod_1.z.object({
    type: zod_1.z.nativeEnum(client_1.LoanType),
    partnerId: zod_1.z.number().int().positive(),
    articleId: zod_1.z.number().int().positive(),
    lotId: zod_1.z.number().int().positive().nullish(),
    depotId: zod_1.z.number().int().positive().nullish(),
    locationId: zod_1.z.number().int().positive().nullish(),
    quantity: zod_1.z.number().positive(),
    loanDate: zod_1.z.coerce.date(),
    observation: zod_1.z.string().max(255).nullish(),
    // D20, decision 4 : un PRET sort du stock, il est donc soumis au controle
    // d'empietement sur stock reserve et accepte un jeton de confirmation.
    confirmToken: zod_1.z.string().max(4000).nullish(),
});
exports.restitutionSchema = zod_1.z.object({
    loanId: zod_1.z.coerce.bigint(),
    type: zod_1.z.nativeEnum(client_1.RestitutionType),
    quantity: zod_1.z.number().positive(),
    restDate: zod_1.z.coerce.date(),
    // RESTITUTION_EMPRUNT sort du stock : meme controle d'empietement que le pret.
    confirmToken: zod_1.z.string().max(4000).nullish(),
});
exports.inventoryOpenSchema = zod_1.z.object({
    title: zod_1.z.string().max(150).nullish(),
    depotId: zod_1.z.number().int().positive(),
});
exports.inventoryCountSchema = zod_1.z.object({
    qtyCounted: zod_1.z.number().nonnegative(),
});
exports.inventoryValidateSchema = zod_1.z.object({
    decision: zod_1.z.nativeEnum(client_1.InventoryDecision),
    lossReason: zod_1.z.string().max(150).nullish(),
    // D20, decision 4 : la cloture d'inventaire retire du stock (PERTE, ou
    // AJUSTEMENT negatif), elle est donc soumise au controle d'empietement.
    confirmToken: zod_1.z.string().max(4000).nullish(),
});
exports.bonSchema = zod_1.z.object({
    type: zod_1.z.enum(['ENTREE', 'SORTIE', 'LIVRAISON', 'TRANSFERT', 'RETOUR']),
    depotId: zod_1.z.number().int().positive().nullish(),
    depotDestId: zod_1.z.number().int().positive().nullish(),
    partnerId: zod_1.z.number().int().positive().nullish(),
    bonDate: zod_1.z.coerce.date(),
    currency: zod_1.z.enum(currencies_1.CURRENCY_CODES).default(currencies_1.DEFAULT_CURRENCY),
    lines: zod_1.z
        .array(zod_1.z.object({
        articleId: zod_1.z.number().int().positive(),
        lotId: zod_1.z.number().int().positive().nullish(),
        quantity: zod_1.z.number().positive(),
        unitPrice: zod_1.z.number().nonnegative().nullish(),
        observation: zod_1.z.string().max(255).nullish(),
    }))
        .min(1),
});
exports.reservationSchema = zod_1.z.object({
    partnerId: zod_1.z.number().int().positive(),
    // Personnel libre : il peut ne correspondre a aucun utilisateur de l'application.
    staffLabel: zod_1.z.string().trim().min(1).max(100),
    staffId: zod_1.z.number().int().positive().nullish(),
    startDate: zod_1.z.coerce.date(),
    endDate: zod_1.z.coerce.date(),
    observation: zod_1.z.string().max(255).nullish(),
    lines: zod_1.z
        .array(zod_1.z.object({
        articleId: zod_1.z.number().int().positive(),
        quantity: zod_1.z.number().positive(),
    }))
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
function checkPlafondPct(value) {
    if (value === undefined)
        return null;
    if (typeof value !== 'string') {
        return 'Le plafond doit être un pourcentage, par exemple 15 ou 12.5.';
    }
    const brut = value.trim();
    if (!POURCENTAGE.test(brut)) {
        return ('Le plafond doit être un pourcentage, par exemple 15 ou 12.5 (point décimal, ' +
            'la virgule est refusée : elle rendrait le réglage sans effet).');
    }
    const n = Number(brut);
    if (n <= 0 || n > 100)
        return 'Le plafond doit être compris entre 0 (exclu) et 100.';
    return null;
}
exports.settingsSchema = zod_1.z
    .record(zod_1.z.string().min(1), zod_1.z.string().min(1))
    .superRefine((data, ctx) => {
    if (!(reservationStock_1.PLAFOND_CODE in data))
        return;
    const message = checkPlafondPct(data[reservationStock_1.PLAFOND_CODE]);
    if (message) {
        ctx.addIssue({ code: zod_1.z.ZodIssueCode.custom, path: [reservationStock_1.PLAFOND_CODE], message });
    }
});
/** D21 : dispense du plafond, accordee par la direction generale. */
exports.plafondExemptSchema = zod_1.z.object({
    plafondExempt: zod_1.z.boolean(),
});
exports.lotSchema = zod_1.z.object({
    articleId: zod_1.z.number().int().positive(),
    lotNumber: zod_1.z.string().min(1).max(100),
    fabricDate: zod_1.z.coerce.date().nullish(),
    expiryDate: zod_1.z.coerce.date().nullish(),
    unitPrice: zod_1.z.number().nonnegative().nullish(),
    currency: zod_1.z.enum(currencies_1.CURRENCY_CODES).nullish(),
    observation: zod_1.z.string().max(2000).nullish(),
});
// Schema partiel pour la modification d'un lot existant : tous les champs sont optionnels,
// seuls ceux fournis sont mis a jour. observation inclus pour pouvoir editer ce champ.
exports.lotUpdateSchema = exports.lotSchema.partial();
//# sourceMappingURL=index.js.map