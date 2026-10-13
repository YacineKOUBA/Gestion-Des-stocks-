"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parse = parse;
exports.toBigInt = toBigInt;
exports.toInt = toInt;
const apiError_1 = require("./apiError");
function parse(schema, data) {
    return schema.parse(data);
}
/** Convertit un identifiant de route (string) en BigInt avec erreur 400 si invalide. */
function toBigInt(value) {
    if (!/^\d+$/.test(value))
        throw (0, apiError_1.badRequest)(`Identifiant invalide : ${value}`);
    return BigInt(value);
}
/** Convertit un identifiant de route (string) en number avec erreur 400 si invalide. */
function toInt(value) {
    if (!/^\d+$/.test(value))
        throw (0, apiError_1.badRequest)(`Identifiant invalide : ${value}`);
    return Number(value);
}
//# sourceMappingURL=parse.js.map