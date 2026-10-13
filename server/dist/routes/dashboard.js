"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const dashboardService_1 = require("../services/dashboardService");
const permissions_1 = require("../middlewares/permissions");
const router = (0, express_1.Router)();
router.use((0, permissions_1.requirePermission)('dashboard:read'));
router.get('/kpis', async (_req, res) => {
    res.json(await (0, dashboardService_1.kpis)());
});
router.get('/alerts', async (_req, res) => {
    res.json(await (0, dashboardService_1.alerts)());
});
router.get('/lots-flags', async (_req, res) => {
    res.json(await (0, dashboardService_1.lotsFlags)());
});
router.get('/stock-by-category', async (_req, res) => {
    res.json(await (0, dashboardService_1.stockByCategory)());
});
exports.default = router;
//# sourceMappingURL=dashboard.js.map