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
 * - `reservation:write`    creation d'une reservation, et ANNULATION (le stock est
 *                          immediatement rendu)
 * - `reservation:decide`   VALIDATION d'une reservation. Scinde de `write` car la
 *                          validation transforme les mouvements de blocage en
 *                          SORTIES : elle autorise une sortie reelle du stock.
 *                          Le module Reservation n'a pas d'autre ecriture.
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
  'reservation:decide',
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

/**
 * SALES_ADMIN : administration des ventes (D19).
 *
 * Cinq ecrans demandes par le directeur : etat de stock, articles, mouvement,
 * lots et peremption, en LECTURE SEULE, plus l'ecran Reservation en lecture et
 * en ecriture.
 *
 * Sur Reservation il peut creer et annuler, mais PAS valider : la validation
 * transforme les mouvements de blocage en SORTIES et autorise donc une sortie
 * reelle du stock. D'ou le droit distinct `reservation:decide`, qu'il n'a pas.
 *
 * `referential:read` lui est accorde malgre l'absence de l'ecran Referentiel :
 * le filtre Categorie de l'ecran Article, le filtre Depot de l'ecran Mouvement
 * et le formulaire de Reservation (choix de l'acteur) en dependent. Il n'a ni
 * `referential:manage` ni `referential:write`.
 *
 * Aucun droit d'ecriture sur articles, mouvements et lots. Aucun acces au
 * tableau de bord, a l'inventaire, aux prets/emprunts, aux bons, a la
 * valorisation, aux utilisateurs, aux parametres ni au journal d'audit : ces
 * ecrans ne figuraient pas dans la demande.
 *
 * Il n'a PAS `dashboard:read`, et c'est voulu. La redirection vers le premier
 * ecran autorise remplace l'ancien renvoi en dur vers '/' : sans cela, ce profil
 * boucle sur la page d'accueil, qui exige precisement le droit qu'il n'a pas.
 */
const SALES_ADMIN_PERMISSIONS: Permission[] = [
  'stock:read',
  'article:read',
  'movement:read',
  'lot:read',
  'referential:read',
  'reservation:read',
  'reservation:write',
];

export const ROLE_PERMISSIONS: Record<RoleCode, readonly Permission[]> = {
  ADMIN: ADMIN_PERMISSIONS,
  MAGASINIER: MAGASINIER_PERMISSIONS,
  TOP_MANAGEMENT: TOP_MANAGEMENT_PERMISSIONS,
  SALES_ADMIN: SALES_ADMIN_PERMISSIONS,
};

/** Droits effectivement accordes a un role. */
export function permissionsFor(role: RoleCode): Permission[] {
  return [...(ROLE_PERMISSIONS[role] ?? [])];
}

export function can(role: RoleCode, permission: Permission): boolean {
  return permissionsFor(role).includes(permission);
}
