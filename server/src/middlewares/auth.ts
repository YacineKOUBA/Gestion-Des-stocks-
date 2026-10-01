import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../prisma';
import { unauthorized } from '../utils/apiError';
import type { RoleCode } from '@prisma/client';

export async function auth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw unauthorized('Jeton manquant');
  }
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(header.slice(7), config.jwtSecret) as jwt.JwtPayload;
  } catch {
    throw unauthorized('Jeton invalide ou expiré');
  }

  const id = Number(payload.sub);
  if (!Number.isInteger(id) || id <= 0) throw unauthorized('Jeton invalide');

  // Re-validation en base : prise en compte immediate des desactivations
  // et des changements de role sans attendre l'expiration du jeton.
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, isActive: true, role: { select: { code: true } } },
  });
  if (!user || !user.isActive) throw unauthorized('Compte désactivé ou introuvable');

  req.user = { id: user.id, role: user.role.code as RoleCode };
  next();
}
