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
const bonService = __importStar(require("../services/bonService"));
const parse_1 = require("../utils/parse");
const validators_1 = require("../validators");
const permissions_1 = require("../middlewares/permissions");
const router = (0, express_1.Router)();
// Documents (bons de sortie / livraison / transfert / retour).
// D16 : ce module n'etait protege par AUCUNE porte. Il le devient, sinon un profil
// de consultation comme TOP_MANAGEMENT y aurait acces par defaut.
router.get('/', (0, permissions_1.requirePermission)('bon:read'), async (_req, res) => {
    res.json(await bonService.listBons());
});
router.get('/:id', (0, permissions_1.requirePermission)('bon:read'), async (req, res) => {
    res.json(await bonService.getBon((0, parse_1.toBigInt)(req.params.id)));
});
router.post('/', (0, permissions_1.requirePermission)('bon:write'), async (req, res) => {
    const data = (0, parse_1.parse)(validators_1.bonSchema, req.body);
    res.status(201).json(await bonService.createBon(data, req.user.id));
});
exports.default = router;
//# sourceMappingURL=bons.js.map