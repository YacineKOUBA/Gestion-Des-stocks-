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
const prisma_1 = require("../prisma");
const inventoryService = __importStar(require("../services/inventoryService"));
const parse_1 = require("../utils/parse");
const validators_1 = require("../validators");
const permissions_1 = require("../middlewares/permissions");
const router = (0, express_1.Router)();
router.get('/', (0, permissions_1.requirePermission)('inventory:read'), async (_req, res) => {
    const inventories = await prisma_1.prisma.inventory.findMany({
        include: {
            depot: true,
            lines: { take: 0 },
            _count: { select: { lines: true } },
        },
        orderBy: { openedAt: 'desc' },
    });
    res.json(inventories);
});
router.get('/:id', (0, permissions_1.requirePermission)('inventory:read'), async (req, res) => {
    const id = (0, parse_1.toBigInt)(req.params.id);
    res.json(await inventoryService.getInventory(id));
});
router.post('/', (0, permissions_1.requirePermission)('inventory:write'), async (req, res) => {
    const data = (0, parse_1.parse)(validators_1.inventoryOpenSchema, req.body);
    res.status(201).json(await inventoryService.openInventory(data.title ?? undefined, data.depotId, req.user.id));
});
router.post('/:id/populate', (0, permissions_1.requirePermission)('inventory:write'), async (req, res) => {
    const id = (0, parse_1.toBigInt)(req.params.id);
    const depotId = Number(req.body.depotId);
    res.json(await inventoryService.populateLines(id, depotId));
});
// Saisie des quantites comptees : ouvert au magasinier, qui fait le comptage physique.
router.post('/:id/lines/:lineId/count', (0, permissions_1.requirePermission)('inventory:count'), async (req, res) => {
    const id = (0, parse_1.toBigInt)(req.params.id);
    const lineId = (0, parse_1.toBigInt)(req.params.lineId);
    const data = (0, parse_1.parse)(validators_1.inventoryCountSchema, req.body);
    res.json(await inventoryService.setCount(id, lineId, data.qtyCounted, req.user.id));
});
router.post('/:id/lines/:lineId/validate', (0, permissions_1.requirePermission)('inventory:decide'), async (req, res) => {
    const lineId = (0, parse_1.toBigInt)(req.params.lineId);
    const data = (0, parse_1.parse)(validators_1.inventoryValidateSchema, req.body);
    res.json(await inventoryService.validateLine(lineId, data.decision, data.lossReason ?? undefined, req.user.id, data.confirmToken ?? null));
});
router.post('/:id/close', (0, permissions_1.requirePermission)('inventory:decide'), async (req, res) => {
    res.json(await inventoryService.closeInventory((0, parse_1.toBigInt)(req.params.id), req.user.id));
});
exports.default = router;
//# sourceMappingURL=inventories.js.map