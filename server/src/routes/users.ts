import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { parse } from '../utils/parse';
import { userCreateSchema, userUpdateSchema } from '../validators';
import { audit } from '../utils/audit';
import { requirePermission } from '../middlewares/permissions';
import { badRequest, conflict, notFound } from '../utils/apiError';

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

  // Changement d'identifiant : on refuse un doublon en le nommant, plutot que de
  // laisser la contrainte d'unicite produire un 409 generique (« Doublon detecte »).
  const nouveauLogin = data.login;
  const loginChange = nouveauLogin !== undefined && nouveauLogin !== before.login;
  if (loginChange) {
    const dejaPris = await prisma.user.findFirst({
      where: { login: { equals: nouveauLogin, mode: 'insensitive' }, id: { not: id } },
      select: { id: true },
    });
    if (dejaPris) {
      throw conflict(`L'identifiant « ${nouveauLogin} » est déjà utilisé par un autre compte.`);
    }
  }

  const nouveauMotDePasse = data.password ?? '';
  const passwordChanged = nouveauMotDePasse.length > 0;
  const passwordHash = passwordChanged ? await bcrypt.hash(nouveauMotDePasse, 10) : undefined;
  let user;
  try {
    user = await prisma.user.update({
      where: { id },
      data: {
        login: loginChange ? nouveauLogin : undefined,
        displayName: data.displayName ?? undefined,
        isActive: data.isActive ?? undefined,
        ...(passwordHash ? { passwordHash } : {}),
      },
      select: userSelect,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw conflict(`L'identifiant « ${nouveauLogin} » est déjà utilisé par un autre compte.`);
    }
    throw err;
  }
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

/**
 * Suppression DEFINITIVE d'un compte, reservee a l'administrateur (`user:delete`).
 *
 * Meme garde-fou de tracabilite que pour les lots et les articles : un compte
 * n'est effacable que s'il n'a JAMAIS agi. Des qu'il est l'auteur d'un mouvement
 * ou d'une reservation, l'effacer detacherait l'historique de son auteur ; on
 * refuse alors en renvoyant vers la desactivation, qui conserve la trace.
 *
 * Deux protections supplementaires : on ne supprime pas son propre compte (on se
 * verrouillerait dehors) et on ne supprime pas le dernier administrateur actif
 * (plus personne ne pourrait gerer l'application).
 */
router.delete('/:id', requirePermission('user:delete'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw badRequest('Identifiant invalide');
  }

  const user = await prisma.user.findUnique({ where: { id }, select: userSelect });
  if (!user) throw notFound('Utilisateur introuvable');
  if (id === req.user!.id) {
    throw badRequest('Vous ne pouvez pas supprimer votre propre compte.');
  }

  if (user.role?.code === 'ADMIN') {
    const autresAdmins = await prisma.user.count({
      where: { id: { not: id }, isActive: true, role: { code: 'ADMIN' } },
    });
    if (autresAdmins === 0) {
      throw conflict(
        'Suppression impossible : ce compte est le dernier administrateur actif. ' +
          'Créez ou réactivez un autre administrateur avant de le supprimer.',
      );
    }
  }

  const [moves, movesCanceled, reservationsCreated, reservationsClosed, reservationsStaff] =
    await Promise.all([
      prisma.move.count({ where: { createdBy: id } }),
      prisma.move.count({ where: { canceledBy: id } }),
      prisma.reservation.count({ where: { createdBy: id } }),
      prisma.reservation.count({ where: { closedBy: id } }),
      prisma.reservation.count({ where: { staffId: id } }),
    ]);
  const activite = moves + movesCanceled + reservationsCreated + reservationsClosed + reservationsStaff;
  if (activite > 0) {
    const details = [
      moves ? `${moves} mouvement(s)` : null,
      movesCanceled ? `${movesCanceled} annulation(s)` : null,
      reservationsCreated ? `${reservationsCreated} réservation(s) créée(s)` : null,
      reservationsClosed ? `${reservationsClosed} réservation(s) clôturée(s)` : null,
      reservationsStaff ? `${reservationsStaff} réservation(s) comme personnel` : null,
    ]
      .filter(Boolean)
      .join(', ');
    throw conflict(
      `Suppression impossible : ce compte a déjà agi (${details}). ` +
        'Pour conserver la traçabilité, désactivez-le plutôt (compte inactif).',
    );
  }

  await prisma.user.delete({ where: { id } });
  // Trace de la suppression : l'acteur est l'administrateur connecte, le compte
  // supprime est decrit dans `before` (login, nom, role) puisque la ligne disparait.
  await audit(req.user!.id, 'SUPPRESSION', 'user', String(id), { before: user });
  res.json({ id });
});

export default router;
