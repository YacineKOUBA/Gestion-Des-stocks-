import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';
import { config } from '../config';
import { parse } from '../utils/parse';
import { loginSchema } from '../validators';
import { audit } from '../utils/audit';
import { auth } from '../middlewares/auth';
import { unauthorized } from '../utils/apiError';
import { permissionsFor } from '../auth/permissions';

const router = Router();

router.post('/login', async (req, res) => {
  const { login, password } = parse(loginSchema, req.body);
  const user = await prisma.user.findUnique({ where: { login }, include: { role: true } });
  if (!user || !user.isActive) throw unauthorized('Identifiants invalides');
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw unauthorized('Identifiants invalides');

  const token = jwt.sign(
    { sub: user.id, role: user.role.code },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'] },
  );
  await audit(user.id, 'CONNEXION', 'user', String(user.id), { login });
  res.json({
    token,
    user: {
      id: user.id,
      login: user.login,
      displayName: user.displayName,
      role: user.role.code,
      roleLabel: user.role.label,
      // D16 : le client recoit ses droits, il ne duplique donc pas la matrice.
      permissions: permissionsFor(user.role.code),
    },
  });
});

router.get('/me', auth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: { role: true },
  });
  res.json({
    id: user!.id,
    login: user!.login,
    displayName: user!.displayName,
    role: user!.role.code,
    roleLabel: user!.role.label,
    permissions: permissionsFor(user!.role.code),
  });
});

export default router;