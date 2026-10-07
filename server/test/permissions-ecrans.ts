/**
 * D28 — RECIPE PERMANENTE : « tout ecran ouvrable par un profil doit pouvoir
 * charger les donnees dont il a besoin ».
 *
 * LE DEFAUT QUE CE TEST EMPECHE
 * ----------------------------
 * Le directeur a signale que « les filtres de certaines pages ne fonctionnent
 * pas pour presque tous les utilisateurs ». Mesure faite : un seul profil etait
 * casse, `TOP_MANAGEMENT`, sur 6 ecrans et 14 appels. Cause : il etait le seul
 * profil sans `referential:read`, alors que tout le module `/referential` est
 * protege par ce droit **et que des ecrans purement lecteurs en dependent pour
 * leurs filtres**.
 *
 * Ce defaut a une propriete qui rend toute recette « au clic » insuffisante :
 * **rien ne casse**. La page s'affiche, ses tableaux se remplissent, ses
 * filtres renvoient un tableau vide, et l'utilisateur ne voit aucun message. Il
 * n'a ete detecte qu'en comparant, profil par profil, les droits servis par
 * l'API aux routes reellement appelees par les ecrans ouverts a ce profil.
 *
 * Ce test fait cette comparaison, a froid, sans serveur et sans base : il lit le
 * code des routes, en deduit le droit exige par chacune, et le compare a la
 * matrice des droits pour chaque profil et chaque ecran que ce profil peut
 * ouvrir. Un ecart sort en echec.
 *
 * IL NE PEUT PAS DERIVER : les dependances d'ecran sont declarees dans
 * `ECRANS_DONT_DEPENDANCES` ci-dessous, et `verifierCouvertureDesEcrans()`
 * verifie que cette table couvre **exactement** les entrees du menu client. Un
 * ecran ajoute sans ses dependances fait donc echouer le test — c'est ce qui
 * empeche la table de vieillir en silence.
 *
 * LANCEMENT : `npm test` (server/test/permissions-ecrans.ts)
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROLE_PERMISSIONS, type Permission } from '../src/auth/permissions';

// ---------------------------------------------------------------------------
// 1. Le code des routes, lu tel quel.
// ---------------------------------------------------------------------------

/** Prefixe de montage de chaque module, lu dans `routes/index.ts`. */
function lireMontages(): Map<string, string> {
  const src = readFileSync(join(__dirname, '..', 'src', 'routes', 'index.ts'), 'utf8');
  const fichiers = new Map<string, string>();
  for (const m of src.matchAll(/import\s+(\w+)\s+from\s+'\.\/(\w+)'/g)) {
    fichiers.set(m[1]!, `${m[2]}.ts`);
  }
  const montages = new Map<string, string>();
  for (const m of src.matchAll(/router\.use\('([^']+)',\s*(\w+)\)/g)) {
    const fichier = fichiers.get(m[2]!);
    if (fichier) montages.set(fichier, m[1]!);
  }
  return montages;
}

/**
 * Route -> droit qui la protege, deduit du code source.
 *
 * Deux idiomes seulement dans ce projet, tous deux lus ici :
 *   - `router.use(requirePermission('x'))` : garde de module, appliquee a tout
 *     ce qui suit dans le fichier ;
 *   - `router.get('/x', requirePermission('y'), ...)` : droit sur la route.
 *
 * Une route sans droit explicite herite de la garde de module. C'est ainsi que
 * fonctionnent `/referential/*` : un seul `router.use` couvre les neuf listes.
 */
function lireDroitsDesRoutes(): Map<string, Permission> {
  const dossier = join(__dirname, '..', 'src', 'routes');
  const montages = lireMontages();
  const droits = new Map<string, Permission>();

  for (const fichier of readdirSync(dossier).filter((f) => f.endsWith('.ts'))) {
    const src = readFileSync(join(dossier, fichier), 'utf8');
    const prefixe = montages.get(fichier) ?? '';

    const garde = src.match(/router\.use\(\s*requirePermission\('([^']+)'\)\s*\)/);
    const droitDeModule = garde?.[1] as Permission | undefined;

    for (const m of src.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']*)'/g)) {
      const methode = m[1]!.toUpperCase();
      const sousChemin = m[2]!;
      // La fenetre s'arrete a la route suivante : sans cela, une route sans
      // droit propre emprunterait celui de la route qui suit.
      const suite = src.slice(m.index, m.index + 600);
      const fin = suite.indexOf('router.', 1);
      const Fenetre = fin === -1 ? suite : suite.slice(0, fin);
      const explicite = Fenetre.match(/requirePermission\('([^']+)'\)/);
      const droit = (explicite?.[1] ?? droitDeModule) as Permission | undefined;
      if (!droit) continue;
      const chemin = `${prefixe}${sousChemin === '/' ? '' : sousChemin}`;
      droits.set(`${methode} ${chemin}`, droit);
    }
  }
  return droits;
}

// ---------------------------------------------------------------------------
// 2. Le menu client, lu tel quel : chaque ecran et le droit qui l'ouvre.
// ---------------------------------------------------------------------------

interface EntreeMenu {
  chemin: string;
  libelle: string;
  droit: Permission;
}

function lireMenuClient(): EntreeMenu[] {
  const src = readFileSync(
    join(__dirname, '..', '..', 'client', 'src', 'components', 'Layout.tsx'),
    'utf8',
  );
  const bloc = src.slice(src.indexOf('NAV_ITEMS'), src.indexOf('];', src.indexOf('NAV_ITEMS')));
  const entrees: EntreeMenu[] = [];
  for (const m of bloc.matchAll(
    // Le libelle est accepte en apostrophes comme en guillemets : « Journal
    // d'audit » ne peut pas s'ecrire en apostrophes, et une regex trop stricte
    // ferait disparaitre un ecran du controle sans rien signaler.
    /\{\s*to:\s*'([^']+)',\s*label:\s*(?:'([^']*)'|"([^"]*)")(?:[^}]*?)permission:\s*'([^']+)'/g,
  )) {
    entrees.push({ chemin: m[1]!, libelle: m[2] ?? m[3] ?? '', droit: m[4] as Permission });
  }
  return entrees;
}

// ---------------------------------------------------------------------------
// 3. Les dependances de chaque ecran, declarees.
// ---------------------------------------------------------------------------

/**
 * Chemins APPELES par l'ecran, filtres et formulaires compris — pas seulement ce
 * que l'ecran affiche en tableau. Un ecran dont un filtre lit une liste
 * protectee par un autre droit que le sien est le piege de D27.
 *
 * `acquittee` : dependance reellement refusee, arbitragee et assumee. Elle
 * n'est pas verifiee, mais elle est **réaffichée a chaque execution** pour ne
 * pas finir oubliée.
 */
interface Ecran {
  chemin: string;
  libelle: string;
  deps: string[];
  acquittee?: { dep: string; motif: string };
}

const ECRANS_DONT_DEPENDANCES: Ecran[] = [
  {
    chemin: '/',
    libelle: 'Tableau de bord',
    deps: ['/dashboard/kpis', '/dashboard/alerts', '/dashboard/lots-flags'],
    // D17 : la carte des prets n'est interrogee que si le profil a `loan:read`,
    // sinon l'appel echouerait en 403 sur l'ecran d'accueil.
    acquittee: { dep: '/loans', motif: 'D17 — appel deja conditionne par can(loan:read) dans DashboardPage' },
  },
  {
    chemin: '/stock',
    libelle: 'Etat de stock',
    deps: ['/stock', '/stock/depots', '/stock/categories', '/stock/thresholds'],
  },
  {
    chemin: '/articles',
    libelle: 'Article',
    deps: [
      '/articles',
      '/referential/categories',
      '/referential/units',
      '/referential/families',
      '/referential/packaging',
      '/referential/origins',
    ],
  },
  {
    chemin: '/mouvements',
    libelle: 'Mouvement',
    // `/articles` et `/lots` alimentent les selecteurs du formulaire de saisie.
    deps: ['/movements', '/referential/depots', '/referential/partners', '/stock/locations', '/articles', '/lots'],
  },
  {
    chemin: '/lots',
    libelle: 'Lots & peremptions',
    deps: ['/lots', '/articles'],
  },
  {
    chemin: '/inventaires',
    libelle: 'Inventaire',
    deps: ['/inventories', '/referential/depots'],
  },
  {
    chemin: '/prets',
    libelle: 'Pret / Emprunt',
    deps: ['/loans', '/loans/synthesis', '/referential/partners', '/referential/depots', '/stock/locations', '/articles', '/lots'],
  },
  {
    chemin: '/reservations',
    libelle: 'Reservation',
    deps: ['/reservations', '/reservations/synthesis', '/referential/partners', '/articles'],
    // Arbitrage du directeur : ne pas traiter pour l'instant. `usersApi.list()`
    // revient en 403 pour les 3 profils sans `user:read` ; il ne sert qu'a la
    // liste de suggestions du personnel, le champ restant en texte libre.
    acquittee: {
      dep: '/users',
      motif: 'ARBITRE — non corrige : autocomplétion du personnel vide, `staffId` non renseigne',
    },
  },
  {
    chemin: '/bons',
    libelle: 'Document',
    deps: ['/bons', '/referential/depots', '/referential/partners', '/articles', '/lots'],
  },
  {
    chemin: '/valorisation',
    libelle: 'Valorisation',
    deps: ['/valuation', '/referential/categories', '/referential/families', '/referential/depots'],
  },
  {
    chemin: '/referentiels',
    libelle: 'Referentiel',
    deps: ['/referential/categories', '/referential/depots', '/referential/partners'],
  },
  {
    chemin: '/utilisateurs',
    libelle: 'Utilisateurs',
    deps: ['/users', '/referential/roles'],
  },
  { chemin: '/parametres', libelle: 'Parametres', deps: ['/settings'] },
  { chemin: '/audit', libelle: "Journal d'audit", deps: ['/audit'] },
];

// ---------------------------------------------------------------------------
// 4. Les verifications.
// ---------------------------------------------------------------------------

let verifications = 0;
let ecarts = 0;

function control(condition: boolean, message: string) {
  verifications += 1;
  if (!condition) {
    ecarts += 1;
    console.log(`  ECHEC  ${message}`);
  }
}

/** Une route declaree doit exister : un renommage cote serveur doit se voir. */
function verifierRoutesDeclarees(droits: Map<string, Permission>) {
  for (const ecran of ECRANS_DONT_DEPENDANCES) {
    for (const dep of [...ecran.deps, ...(ecran.acquittee ? [ecran.acquittee.dep] : [])]) {
      control(
        droits.has(`GET ${dep}`),
        `${ecran.libelle} : la dependance « ${dep} » n'existe plus cote serveur ` +
          `(route renommee ? le test doit etre mis a jour, pas ignore).`,
      );
    }
  }
}

/** La table doit couvrir exactement le menu client : ni plus, ni moins. */
function verifierCouvertureDesEcrans(menu: EntreeMenu[]) {
  const declares = new Map(ECRANS_DONT_DEPENDANCES.map((e) => [e.chemin, e]));
  for (const entree of menu) {
    control(
      declares.has(entree.chemin),
      `Ecran « ${entree.libelle} » (${entree.chemin}) absent de ECRANS_DONT_DEPENDANCES : ` +
        `ses dependances ne sont donc pas verifiees.`,
    );
  }
  for (const ecran of ECRANS_DONT_DEPENDANCES) {
    control(
      menu.some((e) => e.chemin === ecran.chemin),
      `Ecran « ${ecran.libelle} » (${ecran.chemin}) declare dans le test mais absent du menu client : ` +
        `le test verifierait un ecran qui n'existe plus.`,
    );
  }
}

/** L'invariant : un ecran ouvrable doit avoir TOUTES ses dependances. */
function verifierProfils(droits: Map<string, Permission>, menu: EntreeMenu[]) {
  const parChemin = new Map(menu.map((e) => [e.chemin, e]));

  for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    const accordes = new Set<string>(permissions);
    const ecransOuverts = ECRANS_DONT_DEPENDANCES.filter((e) => accordes.has(parChemin.get(e.chemin)?.droit ?? ''));
    const manquants: string[] = [];

    for (const ecran of ecransOuverts) {
      for (const dep of ecran.deps) {
        const requis = droits.get(`GET ${dep}`);
        if (!requis) continue; // deja signale par verifierRoutesDeclarees
        if (!accordes.has(requis)) manquants.push(`${ecran.libelle} → ${dep} (${requis})`);
      }
    }

    const intitule = `${role} (${permissions.length} droits, ${ecransOuverts.length} ecrans)`;
    if (manquants.length === 0) {
      console.log(`  OK     ${intitule}`);
    } else {
      console.log(`  ECHEC  ${intitule}`);
      for (const m of manquants) console.log(`           ${m}`);
    }
    verifications += ecransOuverts.length;
    ecarts += manquants.length;
  }
}

function afficherCasAcquittes() {
  const cas = ECRANS_DONT_DEPENDANCES.filter((e) => e.acquittee);
  if (cas.length === 0) return;
  console.log('\nCAS CONNUS, ARBITRES, NON CORRIGES (rappeles a chaque execution) :');
  for (const ecran of cas) {
    console.log(`  ${ecran.libelle} → ${ecran.acquittee!.dep} : ${ecran.acquittee!.motif}`);
  }
}

// ---------------------------------------------------------------------------

const droits = lireDroitsDesRoutes();
const menu = lireMenuClient();

console.log('=== D28 — les filtres d\'un ecran ouvrable doivent tous se charger ===');
console.log(`  ${droits.size} routes lues dans src/routes, ${menu.length} ecrans dans le menu client`);
console.log('');

verifierRoutesDeclarees(droits);
verifierCouvertureDesEcrans(menu);
verifierProfils(droits, menu);
afficherCasAcquittes();

console.log(`\n${verifications} controles, ${ecarts} ecart(s).`);
if (ecarts > 0) {
  console.log('');
  console.log('  Un ecart signifie qu\'un profil peut ouvrir un ecran dont une liste');
  console.log('  ne lui est pas accessible : le deroulant se videra SANS message.');
  console.log('  Deux solutions, deja employees ailleurs : accorder le droit manquant');
  console.log('  (D17, D19, D25, D27) ou conditionner l\'appel par can(...) dans la page.');
  process.exit(1);
}
