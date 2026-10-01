import { prisma } from '../prisma';
import type { AuditAction } from '@prisma/client';

/** Serialise les details d'audit sans planter sur les BigInt (ids de mouvements, bons...). */
function serializeSafe(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v));
}

export async function audit(
  userId: number | undefined,
  action: AuditAction,
  entity: string,
  entityId: string,
  changes?: unknown,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId,
        changes: changes === undefined ? undefined : JSON.parse(serializeSafe(changes)),
      },
    });
  } catch {
    // L'audit ne doit jamais bloquer l'operation principale.
  }
}