"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const loanService = __importStar(require("../services/loanService"));
const movementService_1 = require("../services/movementService");
const prisma_1 = require("../prisma");
const apiError_1 = require("../utils/apiError");
const parse_1 = require("../utils/parse");
const validators_1 = require("../validators");
const permissions_1 = require("../middlewares/permissions");
const router = (0, express_1.Router)();
// Prets / emprunts : module ouvert a tout profil autorise, la saisie exige loan:write.
router.use((0, permissions_1.requirePermission)('loan:read'));
router.get('/', async (_req, res) => {
    res.json(await loanService.listLoans());
});
// Depot le moins rempli + quantite par depot : suggestion d'accueil pour un EMPRUNT.
router.get('/depot-suggestion', async (_req, res) => {
    res.json(await loanService.leastFilledDepot());
});
// Stock reellement disponible pour un couple article/lot/depot/emplacement : permet a l'UI
// d'afficher la meme valeur que celle controlee a l'enregistrement du pret.
// Sans depot choisi, on renvoie le stock tous depots confondus (et le depot conseille).
router.get('/disponibilite', async (req, res) => {
    const q = req.query;
    const articleId = Number(q.articleId);
    if (!articleId)
        throw (0, apiError_1.badRequest)('articleId requis');
    const lotId = q.lotId ? Number(q.lotId) : null;
    const depotId = q.depotId ? Number(q.depotId) : undefined;
    const locationId = q.locationId ? Number(q.locationId) : null;
    const tousDepots = depotId === undefined && locationId === null;
    const [disponible, cible] = await Promise.all([
        tousDepots
            ? loanService.stockAllDepots(articleId, lotId)
            : (0, movementService_1.availableStock)({ articleId, lotId, depotId, locationId }),
        loanService.resolveStockTarget(articleId, lotId, {}, prisma_1.prisma),
    ]);
    res.json({ disponible, tousDepots, depotConseille: cible.depotId, emplacementConseille: cible.locationId });
});
router.get('/synthesis', async (_req, res) => {
    res.json(await loanService.synthesis());
});
router.post('/', (0, permissions_1.requirePermission)('loan:write'), async (req, res) => {
    const data = (0, parse_1.parse)(validators_1.loanSchema, req.body);
    res.status(201).json(await loanService.createLoan(data, req.user.id));
});
router.post('/restitution', (0, permissions_1.requirePermission)('loan:write'), async (req, res) => {
    const data = (0, parse_1.parse)(validators_1.restitutionSchema, req.body);
    res.status(201).json(await loanService.createRestitution(data, req.user.id));
});
exports.default = router;
//# sourceMappingURL=loans.js.map