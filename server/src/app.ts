import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import { auth } from './middlewares/auth';
import { errorHandler } from './middlewares/error';
import apiRouter from './routes';
import authRouter from './routes/auth';
import { notFound } from './utils/apiError';
import { config } from './config';

// Prisma renvoie des BigInt (ids) : JSON.stringify ne sait pas les sérialiser.
(BigInt.prototype as unknown as { toJSON(): string }).toJSON = function () {
  return this.toString();
};

export const app = express();

// CORS : restreint a CORS_ORIGIN si defini (production), sinon ouvert (reseau local).
app.use(
  cors(
    config.corsOrigin
      ? { origin: config.corsOrigin.split(',').map((o) => o.trim()) }
      : undefined,
  ),
);
app.use(express.json());

// Routes publiques : sante + connexion
app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'GD Trading', version: 'V1' }));
app.use('/api/auth', authRouter);

// Toutes les autres routes API exigent un jeton valide
app.use('/api', auth, apiRouter);

// 404 pour les routes API inconnues
app.use('/api', (_req, _res, next) => next(notFound('Route API introuvable')));

app.use(errorHandler);