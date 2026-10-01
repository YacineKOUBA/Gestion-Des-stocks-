import type { RoleCode } from '@prisma/client';

/**
 * MATRICE DES DROITS (D16)
 * ------------------------
 * Source de verite unique. Le serveur controle chaque route avec `requirePermission`,
 * et renvoie la liste des droits de l'utilisateur dans /auth/login et /auth/me : le
 * client n'a donc aucune copie de cette matrice, il se contente de la lire.
 *
 * Ajouter un profil = une entree dans ROLE_PERMISSIONS ci-dessous. Aucun route, aucune
 * page, aucun menu a modifier.
 *
 * Granularite : volontairement plus fine qu'un simple lecture/ecriture par ecran, parce
 * que les droits reels de MAGASINIER sont heterogenes (il saisit un mouvement mais ne
 * peut pas l'annuler, il cree un inventaire mais ne le clot pas). Une permission par
 * ecran aurait erroneusement enlarge son profil lors de la migration.
 *
 * - `article:write`        creation, modification, prix, suppression
 * - `lot:write`           creation et modification d'un lot (droit du magasinier)
 * - `movement:write`       saisie d'un mouvement
 * - `movement:revise`      annulation, reactivation, suppression (correction apres coup)
 * - `inventory:count`     saisie des quantites comptees (droit du magasinier)
 * - `inventory:write`      creation d'une campagne, generation des lignes
 * - `inventory:decide`     validation d'une ligne, cloture de la campagne
 * - `referential:read`     lecture des listes de reference (choix d'un depot, d'un
 *                          emplacement, d'un acteur dans un formulaire de saisie)
 * - `referential:manage`   acces a l'ECRAN Referentiel (liste + ajout/suppression).
 *                          Distinct de `read` : un profil peut avoir besoin des
 *                          listes pour travailler sans pour autant gerer le referentiel.
 * - `settings:read`        consultation des seuils et constantes
 */
export const PERMISSIONS = [
  'dashboard:read',
  'stock:read',
  'article:read',
  'article:write',
  'movement:read',
  'movement:write',
  'movement:revise',
  'lot:read',
  'lot:write',
  'inventory:read',
  'inventory:count',
  'inventory:write',
  'inventory:decide',
  'loan:read',
  'loan:write',
  'reservation:read',
  'reservation:write',
  'bon:read',
  'bon:write',
  'valuation:read',
  'referential:read',
  'referential:manage',
  'referential:write',
  'user:read',
  'user:write',
  'settings:read',
  'settings:write',
  'audit:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Tout droit : reserve a l'administrateur. */
const ADMIN_PERMISSIONS: Permission[] = [...PERMISSIONS];

/**
 * MAGASINIER : saisie des mouvements et des bons, comptage d'inventaire.
 *
 * Il n'a PAS acces aux ecrans Prets/Emprunts et Reservations (demande du directeur,
 * D17), ni a la Valorisation, ni aux ecran de gestion (Referentiel, Utilisateurs,
 * Parametres, Journal d'audit).
 *
 * `referential:read` lui est accorde malgre l'absence de l'ecran Referentiel dans
 * son menu : les formulaires de saisie de mouvement et de bon ont besoin de lire les
 * depots et les acteurs. Le retirer casse ces formulaires. Il n'a en revanche PAS
 * `referential:manage` : l'ecran de gestion du referentiel lui reste inaccessible.
 * Seule l'ECRITURE du referentiel (`referential:write`) est reservee a l'administrateur.
 *
 * `settings:read` ne lui est pas accorde : aucun de ses ecrans n'en a besoin.
 */
const MAGASINIER_PERMISSIONS: Permission[] = [
  'dashboard:read',
  'stock:read',
  'article:read',
  'movement:read',
  'movement:write',
  'lot:read',
  'lot:write',
  'inventory:read',
  'inventory:count',
  'referential:read',
  'bon:read',
  'bon:write',
];

/**
 * TOP_MANAGEMENT : profil de consultation dedie a la direction generale.
 * Les 9 ecrans demandes, en lecture seule. Aucun ecran de gestion
 * (Referentiel, Utilisateurs, Parametres, Journal d'audit) ni Document (bons).
 */
const TOP_MANAGEMENT_PERMISSIONS: Permission[] = [
  'dashboard:read',
  'stock:read',
  'article:read',
  'movement:read',
  'lot:read',
  'inventory:read',
  'loan:read',
  'reservation:read',
  'valuation:read',
];

export const ROLE_PERMISSIONS: Record<RoleCode, readonly Permission[]> = {
  ADMIN: ADMIN_PERMISSIONS,
  MAGASINIER: MAGASINIER_PERMISSIONS,
  TOP_MANAGEMENT: TOP_MANAGEMENT_PERMISSIONS,
};

/** Droits effectivement accordes a un role. */
export function permissionsFor(role: RoleCode): Permission[] {
  return [...(ROLE_PERMISSIONS[role] ?? [])];
}

export function can(role: RoleCode, permission: Permission): boolean {
  return permissionsFor(role).includes(permission);
}
