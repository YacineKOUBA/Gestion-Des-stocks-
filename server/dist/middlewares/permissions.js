"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requirePermission = requirePermission;
const apiError_1 = require("../utils/apiError");
const permissions_1 = require("../auth/permissions");
/**
 * Controle d'acces par droit (D16).
 *
 * Remplace `requireRole`, qui ne pouvait distinguer que deux roles et obligeait a
 * lister les roles admis route par route. Ici on exprime une CAPACITE : ajouter un
 * profil ne demande aucune modification de route.
 *
 * A poser sur un `router.get(...)` seul, ou sur un `router.use(...)` pour un module
 * entier lorsque tous ses endpoints partagent le meme droit.
 */
function requirePermission(...permissions) {
    return (req, _res, next) => {
        const user = req.user;
        if (!user) {
            throw (0, apiError_1.forbidden)();
        }
        const granted = permissions.some((p) => (0, permissions_1.can)(user.role, p));
        if (!granted) {
            throw (0, apiError_1.forbidden)("Votre profil ne permet pas cette action");
        }
        next();
    };
}
//# sourceMappingURL=permissions.js.map