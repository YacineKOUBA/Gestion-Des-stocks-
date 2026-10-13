"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.auth = auth;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../config");
const prisma_1 = require("../prisma");
const apiError_1 = require("../utils/apiError");
async function auth(req, _res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        throw (0, apiError_1.unauthorized)('Jeton manquant');
    }
    let payload;
    try {
        payload = jsonwebtoken_1.default.verify(header.slice(7), config_1.config.jwtSecret);
    }
    catch {
        throw (0, apiError_1.unauthorized)('Jeton invalide ou expiré');
    }
    const id = Number(payload.sub);
    if (!Number.isInteger(id) || id <= 0)
        throw (0, apiError_1.unauthorized)('Jeton invalide');
    // Re-validation en base : prise en compte immediate des desactivations
    // et des changements de role sans attendre l'expiration du jeton.
    const user = await prisma_1.prisma.user.findUnique({
        where: { id },
        select: { id: true, isActive: true, role: { select: { code: true } } },
    });
    if (!user || !user.isActive)
        throw (0, apiError_1.unauthorized)('Compte désactivé ou introuvable');
    req.user = { id: user.id, role: user.role.code };
    next();
}
//# sourceMappingURL=auth.js.map