"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
require("express-async-errors");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const auth_1 = require("./middlewares/auth");
const error_1 = require("./middlewares/error");
const routes_1 = __importDefault(require("./routes"));
const auth_2 = __importDefault(require("./routes/auth"));
const apiError_1 = require("./utils/apiError");
const config_1 = require("./config");
// Prisma renvoie des BigInt (ids) : JSON.stringify ne sait pas les sérialiser.
BigInt.prototype.toJSON = function () {
    return this.toString();
};
exports.app = (0, express_1.default)();
// CORS : restreint a CORS_ORIGIN si defini (production), sinon ouvert (reseau local).
exports.app.use((0, cors_1.default)(config_1.config.corsOrigin
    ? { origin: config_1.config.corsOrigin.split(',').map((o) => o.trim()) }
    : undefined));
exports.app.use(express_1.default.json());
// Routes publiques : sante + connexion
exports.app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'GD Trading', version: 'V1' }));
exports.app.use('/api/auth', auth_2.default);
// Toutes les autres routes API exigent un jeton valide
exports.app.use('/api', auth_1.auth, routes_1.default);
// 404 pour les routes API inconnues
exports.app.use('/api', (_req, _res, next) => next((0, apiError_1.notFound)('Route API introuvable')));
exports.app.use(error_1.errorHandler);
//# sourceMappingURL=app.js.map