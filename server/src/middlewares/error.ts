import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../utils/apiError';
import { Prisma } from '@prisma/client';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: true,
      code: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: true,
      code: 'VALIDATION_ERROR',
      message: 'Données invalides',
      details: err.flatten(),
    });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({
        error: true,
        code: 'CONFLICT',
        message: 'Doublon détecté (valeur déjà existante)',
      });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({
        error: true,
        code: 'NOT_FOUND',
        message: 'Enregistrement introuvable',
      });
    }
    if (err.code === 'P2003') {
      return res.status(400).json({
        error: true,
        code: 'BAD_REQUEST',
        message: 'Référence liée invalide',
      });
    }
    return res.status(400).json({
      error: true,
      code: 'DB_ERROR',
      message: err.message,
    });
  }
  // Corps JSON invalide (body-parser) : renvoyer 400 plutot que 500.
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      error: true,
      code: 'INVALID_JSON',
      message: 'Corps de requête JSON invalide',
    });
  }
  console.error(err);
  return res
    .status(500)
    .json({ error: true, code: 'SERVER_ERROR', message: 'Erreur interne' });
}