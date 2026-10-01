import { NextFunction, Request, Response } from 'express';
import type { RoleCode } from '@prisma/client';
import { forbidden } from '../utils/apiError';

export function requireRole(...roles: RoleCode[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw forbidden();
    }
    if (!roles.includes(req.user.role)) {
      throw forbidden("L'action nécessite un rôle plus élevé");
    }
    next();
  };
}