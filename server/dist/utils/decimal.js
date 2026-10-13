"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dec = dec;
exports.toNumber = toNumber;
exports.sumDecimals = sumDecimals;
const client_1 = require("@prisma/client");
/** Convertit une valeur Prisma.Decimal | number | string | null en Prisma.Decimal sur. */
function dec(value) {
    if (value === null || value === undefined)
        return new client_1.Prisma.Decimal(0);
    return value instanceof client_1.Prisma.Decimal ? value : new client_1.Prisma.Decimal(value);
}
/** Arrondit un Decimal vers un number JavaScript (pour la serialisation JSON). */
function toNumber(value, digits = 3) {
    if (value === null || value === undefined)
        return 0;
    return Number(value.toFixed(digits));
}
/** Somme precise d'une liste de quantites/prix (evite les erreurs d'arrondi flottantes). */
function sumDecimals(values) {
    return values.reduce((acc, v) => acc.add(dec(v)), new client_1.Prisma.Decimal(0));
}
//# sourceMappingURL=decimal.js.map