import { NextFunction, Request, Response } from 'express';
import { forbidden } from '../utils/apiError';
import { can, type Permission } from '../auth/permissions';

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
export function requirePermission(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      throw forbidden();
    }
    const granted = permissions.some((p) => can(user.role, p));
    if (!granted) {
      throw forbidden("Votre profil ne permet pas cette action");
    }
    next();
  };
}
