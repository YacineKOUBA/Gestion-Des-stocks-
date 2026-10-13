"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = require("../prisma");
const config_1 = require("../config");
const parse_1 = require("../utils/parse");
const validators_1 = require("../validators");
const audit_1 = require("../utils/audit");
const auth_1 = require("../middlewares/auth");
const apiError_1 = require("../utils/apiError");
const permissions_1 = require("../auth/permissions");
const router = (0, express_1.Router)();
router.post('/login', async (req, res) => {
    const { login, password } = (0, parse_1.parse)(validators_1.loginSchema, req.body);
    const user = await prisma_1.prisma.user.findUnique({ where: { login }, include: { role: true } });
    if (!user || !user.isActive)
        throw (0, apiError_1.unauthorized)('Identifiants invalides');
    const ok = await bcryptjs_1.default.compare(password, user.passwordHash);
    if (!ok)
        throw (0, apiError_1.unauthorized)('Identifiants invalides');
    const token = jsonwebtoken_1.default.sign({ sub: user.id, role: user.role.code }, config_1.config.jwtSecret, { expiresIn: config_1.config.jwtExpiresIn });
    await (0, audit_1.audit)(user.id, 'CONNEXION', 'user', String(user.id), { login });
    res.json({
        token,
        user: {
            id: user.id,
            login: user.login,
            displayName: user.displayName,
            role: user.role.code,
            roleLabel: user.role.label,
            // D16 : le client recoit ses droits, il ne duplique donc pas la matrice.
            permissions: (0, permissions_1.permissionsFor)(user.role.code),
        },
    });
});
router.get('/me', auth_1.auth, async (req, res) => {
    const user = await prisma_1.prisma.user.findUnique({
        where: { id: req.user.id },
        include: { role: true },
    });
    res.json({
        id: user.id,
        login: user.login,
        displayName: user.displayName,
        role: user.role.code,
        roleLabel: user.role.label,
        permissions: (0, permissions_1.permissionsFor)(user.role.code),
    });
});
exports.default = router;
//# sourceMappingURL=auth.js.map