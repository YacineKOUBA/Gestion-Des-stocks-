import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma';
import { parse } from '../utils/parse';
import { userCreateSchema, userUpdateSchema } from '../validators';
import { audit } from '../utils/audit';
import { requirePermission } from '../middlewares/permissions';
import { badRequest, notFound } from '../utils/apiError';

const router = Router();
router.use(requirePermission('user:read'));

// Champs retournes au client : jamais le hash du mot de passe.
const userSelect = {
  id: true,
  login: true,
  displayName: true,
  roleId: true,
  isActive: true,
  createdAt: true,
  role: { select: { code: true, label: true } },
} as const;

router.get('/', async (_req, res) => {
  const users = await prisma.user.findMany({
    select: userSelect,
    orderBy: { login: 'asc' },
  });
  res.json(users);
});

router.post('/', requirePermission('user:write'), async (req, res) => {
  const data = parse(userCreateSchema, req.body);
  const passwordHash = await bcrypt.hash(data.password, 10);
  const user = await prisma.user.create({
    data: {
      login: data.login,
      passwordHash,
      displayName: data.displayName,
      roleId: data.roleId,
      createdBy: req.user!.id,
    },
    select: userSelect,
  });
  // C4 : la creation d'un compte est aussi la creation de son secret.
  // userSelect n'expose jamais passwordHash, on note donc le fait, pas la valeur.
  await audit(req.user!.id, 'CREATION', 'user', String(user.id), {
    login: user.login,
    passwordSet: true,
  });
  res.status(201).json(user);
});

router.put('/:id', requirePermission('user:write'), async (req, res) => {
  const id = Number(req.params.id);
  const data = parse(userUpdateSchema, req.body);
  const before = await prisma.user.findUnique({ where: { id }, select: userSelect });
  if (!before) throw notFound('Utilisateur introuvable');
  if (id === req.user!.id && data.isActive === false) {
    throw badRequest('Vous ne pouvez pas désactiver votre propre compte');
  }
  const nouveauMotDePasse = data.password ?? '';
  const passwordChanged = nouveauMotDePasse.length > 0;
  const passwordHash = passwordChanged ? await bcrypt.hash(nouveauMotDePasse, 10) : undefined;
  const user = await prisma.user.update({
    where: { id },
    data: {
      displayName: data.displayName ?? undefined,
      isActive: data.isActive ?? undefined,
      ...(passwordHash ? { passwordHash } : {}),
    },
    select: userSelect,
  });
  // C4 : `before` et `after` utilisent userSelect, qui ne contient jamais
  // passwordHash : sans ce marqueur, un changement de mot de passe laisse une
  // trace d'audit identique a un simple renommage du libelle. On journalise le
  // FAIT du changement, jamais le mot de passe ni son hash.
  await audit(req.user!.id, 'MODIFICATION', 'user', String(id), {
    before,
    after: user,
    ...(passwordChanged ? { passwordChanged: true } : {}),
  });
  res.json(user);
});

export default router;
