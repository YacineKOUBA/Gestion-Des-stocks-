"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.conflict = exports.notFound = exports.forbidden = exports.unauthorized = exports.badRequest = exports.ApiError = void 0;
class ApiError extends Error {
    status;
    code;
    details;
    constructor(status, code, message, 
    /**
     * Charge utile supplementaire serialisee avec l'erreur. Utilisee par D20 :
     * le refus d'empietement sur stock reserve renvoie le detail du conflit
     * (X, Y, Z, overlap) et le jeton de confirmation, pour que le client puisse
     * afficher la question a l'utilisateur sans refaire le calcul.
     */
    details) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details;
        this.name = 'ApiError';
    }
}
exports.ApiError = ApiError;
const badRequest = (msg, details) => new ApiError(400, 'BAD_REQUEST', msg, details);
exports.badRequest = badRequest;
const unauthorized = (msg = 'Non autorisé') => new ApiError(401, 'UNAUTHORIZED', msg);
exports.unauthorized = unauthorized;
const forbidden = (msg = 'Accès refusé') => new ApiError(403, 'FORBIDDEN', msg);
exports.forbidden = forbidden;
const notFound = (msg = 'Introuvable') => new ApiError(404, 'NOT_FOUND', msg);
exports.notFound = notFound;
const conflict = (msg, details) => new ApiError(409, 'CONFLICT', msg, details);
exports.conflict = conflict;
//# sourceMappingURL=apiError.js.map