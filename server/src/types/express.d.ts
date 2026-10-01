import { RoleCode } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        role: RoleCode;
      };
    }
  }
}

export {};