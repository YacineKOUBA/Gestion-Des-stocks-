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
const reservationService = __importStar(require("../services/reservationService"));
const parse_1 = require("../utils/parse");
const validators_1 = require("../validators");
const permissions_1 = require("../middlewares/permissions");
/**
 * Un identifiant de query optionnel. `Number('')` vaut 0 et `Number('abc')` vaut
 * NaN : les deux passeraient pour un identifiant saisi, et 0 ne designe aucun
 * acteur. On ne traduit donc que ce qui est un entier strictement positif.
 */
function parseOptionalId(raw) {
    if (typeof raw !== 'string' || raw.trim() === '')
        return undefined;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : undefined;
}
// D16 : la fenetre RESERVATION reste ouverte a tous les profils qui y ont acces
// (comme les mouvements, les prets ou les bons), mais le module est desormais protege :
// l'ouverture par defaut aurait donne acces a TOP_MANAGEMENT sans le vouloir.
const router = (0, express_1.Router)();
router.get('/', (0, permissions_1.requirePermission)('reservation:read'), async (req, res) => {
    res.json(await reservationService.listReservations({
        status: req.query.status,
        partnerId: req.query.partnerId ? Number(req.query.partnerId) : undefined,
    }));
});
router.get('/synthesis', (0, permissions_1.requirePermission)('reservation:read'), async (_req, res) => {
    res.json(await reservationService.synthesis());
});
// Disponibilite d'un article + detail FEFO (quels lots seraient consommes) : alimente
// le controle de quantite du formulaire.
//
// D21 : `partnerId` designe lacteur pour lequel on veut le plafond. Sans lui,
// l'appel renvoie le plafond theorique du produit (cumul nul) : la page doit
// toujours le passer, sinon le formulaire afficherait le mauvais reste.
router.get('/availability/:articleId', (0, permissions_1.requirePermission)('reservation:read'), async (req, res) => {
    const partnerId = parseOptionalId(req.query.partnerId);
    res.json(await reservationService.availability(Number(req.params.articleId), partnerId));
});
router.get('/:id', (0, permissions_1.requirePermission)('reservation:read'), async (req, res) => {
    res.json(await reservationService.getReservation((0, parse_1.toBigInt)(req.params.id)));
});
router.post('/', (0, permissions_1.requirePermission)('reservation:write'), async (req, res) => {
    const data = (0, parse_1.parse)(validators_1.reservationSchema, req.body);
    res.status(201).json(await reservationService.createReservation(data, req.user.id));
});
// Cas 2 : l'utilisateur valide -> l'acteur a recupere sa reservation, les articles
// sortent reellement (tracee comme une VALIDATION dans le journal d'audit).
// `reservation:decide` et non `reservation:write` : la validation autorise une
// sortie physique du stock, ce n'est pas une simple gestion de la reservation.
// Elle reste donc separee de la creation et de l'annulation (D19).
router.post('/:id/valider', (0, permissions_1.requirePermission)('reservation:decide'), async (req, res) => {
    res.json(await reservationService.validateReservation((0, parse_1.toBigInt)(req.params.id), req.user.id));
});
// Cas 1 : l'utilisateur annule -> le stock est immediatement rendu.
router.post('/:id/annuler', (0, permissions_1.requirePermission)('reservation:write'), async (req, res) => {
    res.json(await reservationService.cancelReservation((0, parse_1.toBigInt)(req.params.id), req.user.id));
});
exports.default = router;
//# sourceMappingURL=reservations.js.map