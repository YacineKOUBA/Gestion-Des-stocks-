"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../prisma");
const parse_1 = require("../utils/parse");
const validators_1 = require("../validators");
const audit_1 = require("../utils/audit");
const permissions_1 = require("../middlewares/permissions");
const reservationStock_1 = require("../services/reservationStock");
const apiError_1 = require("../utils/apiError");
const router = (0, express_1.Router)();
router.get('/', (0, permissions_1.requirePermission)('settings:read'), async (_req, res) => {
    res.json(await prisma_1.prisma.setting.findMany({ orderBy: { code: 'asc' } }));
});
router.put('/', (0, permissions_1.requirePermission)('settings:write'), async (req, res) => {
    // D21 : le plafond est verifie AVANT le schema, pour que le refus porte son motif.
    // Le gestionnaire d'erreurs ne renvoie a l'ecran que « Donnees invalides » pour
    // toute erreur de schema : sans cette garde, taper « 15,5 » donnait un refus
    // opaque — alors que le defaut qu'on cherche a eviter est precisement un plafond
    // enregistre et jamais applique, et que la direction doit pouvoir le voir.
    const plafondBrut = req.body?.[reservationStock_1.PLAFOND_CODE];
    const motif = (0, validators_1.checkPlafondPct)(plafondBrut);
    if (motif)
        throw (0, apiError_1.badRequest)(motif);
    const data = (0, parse_1.parse)(validators_1.settingsSchema, req.body);
    const updated = [];
    for (const [code, value] of Object.entries(data)) {
        await prisma_1.prisma.setting.upsert({
            where: { code },
            update: { value },
            create: { code, value },
        });
        updated.push(code);
    }
    // D20 : le plafond de reservation est lu en memoire pendant 5 s. Il faut
    // l'oublier immediatement, sinon la nouvelle valeur ne s'appliquerait qu'apres
    // le delai, et l'utilisateur pourrait croire que l'ecran ne fonctionne pas.
    if (reservationStock_1.PLAFOND_CODE in data)
        (0, reservationStock_1.invalidatePlafondCache)();
    await (0, audit_1.audit)(req.user.id, 'MODIFICATION', 'settings', updated.join(','), { data });
    res.json({ updated });
});
exports.default = router;
//# sourceMappingURL=settings.js.map