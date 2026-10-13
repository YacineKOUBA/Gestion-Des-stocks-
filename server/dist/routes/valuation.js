"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const valuationService_1 = require("../services/valuationService");
const permissions_1 = require("../middlewares/permissions");
const router = (0, express_1.Router)();
// D16 : la Valorisation etait reservee a l'administrateur. Elle s'ouvre a tout profil
// disposant de valuation:read, ce qui inclut la direction generale.
router.use((0, permissions_1.requirePermission)('valuation:read'));
router.get('/', async (req, res) => {
    const q = req.query;
    res.json(await (0, valuationService_1.valuation)({
        categoryId: q.categoryId ? Number(q.categoryId) : undefined,
        familyId: q.familyId ? Number(q.familyId) : undefined,
        depotId: q.depotId ? Number(q.depotId) : undefined,
    }));
});
exports.default = router;
//# sourceMappingURL=valuation.js.map