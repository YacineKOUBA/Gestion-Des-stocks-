"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const nodeEnv = process.env.NODE_ENV ?? 'development';
const jwtSecret = process.env.JWT_SECRET ?? 'CHANGE_ME';
const corsOrigin = process.env.CORS_ORIGIN ?? process.env.CORS_ORIGINS;
if (nodeEnv === 'production' && jwtSecret === 'CHANGE_ME') {
    throw new Error('JWT_SECRET manquant : définissez une valeur forte dans .env avant de démarrer en production.');
}
if (nodeEnv !== 'production' && jwtSecret === 'CHANGE_ME') {
    console.warn('[config] JWT_SECRET non défini, utilisation de la valeur de développement.');
}
exports.config = {
    port: Number(process.env.PORT ?? 4000),
    jwtSecret,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
    nodeEnv,
    corsOrigin,
};
//# sourceMappingURL=index.js.map