"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_1 = require("../prisma");
const parse_1 = require("../utils/parse");
const validators_1 = require("../validators");
const audit_1 = require("../utils/audit");
const permissions_1 = require("../middlewares/permissions");
const apiError_1 = require("../utils/apiError");
const router = (0, express_1.Router)();
router.use((0, permissions_1.requirePermission)('user:read'));
// Champs retournes au client : jamais le hash du mot de passe.
const userSelect = {
    id: true,
    login: true,
    displayName: true,
    roleId: true,
    isActive: true,
    createdAt: true,
    role: { select: { code: true, label: true } },
};
router.get('/', async (_req, res) => {
    const users = await prisma_1.prisma.user.findMany({
        select: userSelect,
        orderBy: { login: 'asc' },
    });
    res.json(users);
});
router.post('/', (0, permissions_1.requirePermission)('user:write'), async (req, res) => {
    const data = (0, parse_1.parse)(validators_1.userCreateSchema, req.body);
    const passwordHash = await bcryptjs_1.default.hash(data.password, 10);
    const user = await prisma_1.prisma.user.create({
        data: {
            login: data.login,
            passwordHash,
            displayName: data.displayName,
            roleId: data.roleId,
            createdBy: req.user.id,
        },
        select: userSelect,
    });
    // C4 : la creation d'un compte est aussi la creation de son secret.
    // userSelect n'expose jamais passwordHash, on note donc le fait, pas la valeur.
    await (0, audit_1.audit)(req.user.id, 'CREATION', 'user', String(user.id), {
        login: user.login,
        passwordSet: true,
    });
    res.status(201).json(user);
});
router.put('/:id', (0, permissions_1.requirePermission)('user:write'), async (req, res) => {
    const id = Number(req.params.id);
    const data = (0, parse_1.parse)(validators_1.userUpdateSchema, req.body);
    const before = await prisma_1.prisma.user.findUnique({ where: { id }, select: userSelect });
    if (!before)
        throw (0, apiError_1.notFound)('Utilisateur introuvable');
    if (id === req.user.id && data.isActive === false) {
        throw (0, apiError_1.badRequest)('Vous ne pouvez pas désactiver votre propre compte');
    }
    const nouveauMotDePasse = data.password ?? '';
    const passwordChanged = nouveauMotDePasse.length > 0;
    const passwordHash = passwordChanged ? await bcryptjs_1.default.hash(nouveauMotDePasse, 10) : undefined;
    const user = await prisma_1.prisma.user.update({
        where: { id },
        data: {
            displayName: data.displayName ?? undefined,
            isActive: data.isActive ?? undefined,
            ...(passwordHash ? { passwordHash } : {}),
        },
        select: userSelect,
    });
    // C4 : `before` et `after` utilisent userSelect, qui ne contient jamais
    // passwordHash : sans ce marqueur, un changement de mot de passe laisse une
    // trace d'audit identique a un simple renommage du libelle. On journalise le
    // FAIT du changement, jamais le mot de passe ni son hash.
    await (0, audit_1.audit)(req.user.id, 'MODIFICATION', 'user', String(id), {
        before,
        after: user,
        ...(passwordChanged ? { passwordChanged: true } : {}),
    });
    res.json(user);
});
exports.default = router;
//# sourceMappingURL=users.js.map