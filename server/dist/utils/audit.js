"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.audit = audit;
const prisma_1 = require("../prisma");
/** Serialise les details d'audit sans planter sur les BigInt (ids de mouvements, bons...). */
function serializeSafe(value) {
    return JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v));
}
async function audit(userId, action, entity, entityId, changes) {
    try {
        await prisma_1.prisma.auditLog.create({
            data: {
                userId,
                action,
                entity,
                entityId,
                changes: changes === undefined ? undefined : JSON.parse(serializeSafe(changes)),
            },
        });
    }
    catch {
        // L'audit ne doit jamais bloquer l'operation principale.
    }
}
//# sourceMappingURL=audit.js.map