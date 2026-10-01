# GD TRADING - CHECKLIST DE DEPLOIEMENT ET ANOMALIES REPORTEES

**Statut :** A TRAITER AU SINE DE DEPLOIEMENT OFFICIEL
**Date :** 30/09/2026
**Objet :** ce qui a ete volontairement laisse en l'etat, et pourquoi.

Ce document ne contient que des points **volontairement laisses en l'etat** : chacun a ete
examine, puis decide reporte ou assume. Il est ecrit pour que cette liste ne depende pas
d'une conversation.

**Regle de traitement :** chaque point constate est soit corrige et trace dans le code, soit
documente comme ecart assume dans le registre `D1`-`D14` de `03_CAHIER_DES_CHARGES.md`, soit
liste ici. Aucun point ne doit disparaitre silencieusement.

---

## 1. A FAIRE AVANT LA MISE EN SERVICE (bloquant)

### 1.1 - Installer Git et creer le premier depot

| | |
|---|---|
| **Etat** | **Git n'est PAS installe sur la machine de developpement.** |
| **Consequence** | Aucune modification n'est tracee ni reversible. Toutes les corrections de la session de preparation (vague 1 + decisions D2, D3, D4, D5) n'existent que comme fichiers modifies sur disque. |
| **Action** | `winget install Git.Git`, puis `git init`, puis premier commit. |
| **Le `.gitignore` est deja pret** | Il couvre `node_modules/`, `dist/`, `build/`, `*.tsbuildinfo`, `.env`, `.env.*` (avec `!.env.example`), `*.log`, `.vscode/`, `.idea/`. Il n'a jamais servi : il a ete ecrit avant l'installation de Git. |
| **Ordre** | A faire **en tout premier**, avant toute autre intervention : c'est ce qui rendra les lignes suivantes reversibles. |

### 1.2 - Trancher le mode de lancement de la demonstration

**Le mode de lancement n'a jamais ete determine.** C'est une question ouverte, pas une
detail. Elle conditionne les points 2.1 et 2.2.

| Option | Commande | Consequence |
|---|---|---|
| Developpement (ce qui tourne aujourd'hui) | `npm run server:dev` + `npm run client:dev` | `tsx watch` + serveur Vite. Le proxy `/api` rend CORS inutile. **C'est l'etat actuel verifie.** |
| Serveur compile | `npm run build --workspace server` puis `npm run start --workspace server` | Necessite `server/dist`. **Ce dossier a ete supprime (A5/A2) car il etait perime du 28/09** : `npm run start` echoue donc tant que le build n'a pas ete relance. |
| Client statique | `npm run build --workspace client` (`tsc -b && vite build`) | Produit `client/dist`, egalement supprime. Vite est un serveur de **developpement** : `preview` n'est pas un serveur de production. |

**Le `package.json` racine n'expose que** `server:dev`, `server:migrate`, `server:seed`,
`client:dev`. **Il n'y a pas de script `start` ni `build` a la racine** : un operateur qui
tape `npm start` depuis la racine obtient une erreur. A trancher selon l'option retenue :
soit on documente les commandes workspace, soit on ajoute des scripts racine.

**A verifier selon l'option retenue :** le port, l'adresse d'ecoute, et si l'application
doit etre accessible depuis une autre machine du reseau (voir 2.1).

---

## 1 bis. PIEGE DE DEVELOPPEMENT A CONNAITRE (Vite / Windows)

> **Constate le 30/09/2026, apres la correction Partenaire -> Acteur.**
>
> Le watcher de fichiers de Vite sous Windows **ne detecte pas une ecriture qui conserve la
> longueur exacte du fichier**. Concretement : remplacer `header: 'Client'` par
> `header: 'Acteur'` (6 caracteres de chaque cote) n'a pas declenche de rechargement, et
> l'ecran a continue d'afficher « Client » alors que le source etait deja correct et que
> `tsc -b` passait.
>
> Toutes les autres modifications de la meme sequence changeaient la taille du fichier et ont
> ete detectees normalement. C'est donc un piege intermittent, pas systematique.
>
> **Comment verifier qu'une modification est vraiment servie** (a faire systematiquement avant
> d'affirmer qu'un ecran est correct) :
>
> ```
> $body = (Invoke-WebRequest -Uri 'http://localhost:5173/src/pages/<Page>.tsx' -UseBasicParsing).Content
> $body -match 'Acteur'     # doit renvoyer True pour la nouvelle valeur
> ```
>
> Cela interroge le module **effectivement servi** par Vite, et pas le fichier disque.
>
> **Si le module servi est perime**, forcer la detection sans redemarrer le serveur :
> ```
> (Get-Item 'client\src\pages\<Page>.tsx').LastWriteTime = Get-Date
> ```
>
> Redemarrer Vite fonctionne aussi, mais interrompt la session. Le touche-fichier suffit.

---

## 2. A FAIRE AVANT LA MISE EN SERVICE (securite et integrite)

### 2.1 - CORS ouvert (A11)

| | |
|---|---|
| **Etat** | CORS ouvert par defaut : toutes origines acceptees. |
| **Statut** | **Decision documentee, pas une anomalie.** `server/.env.example` (lignes 7-8) documente `CORS_ORIGIN` : vide = tout le LAN. |
| **Pourquoi c'est acceptable** | Le jeton d'authentification circule dans l'en-tete `Authorization`, pas dans un cookie : il n'y a donc pas de surface CSRF. En developpement, le proxy Vite rend CORS inutile. |
| **Risque si le contexte change** | Si l'application est exposee hors du reseau interne, restreindre `CORS_ORIGIN`. Attention : restreindre a la mauvaise valeur casse la demonstration. **A trancher avec 1.2.** |

### 2.2 - `helmet` et rate limit absents (A12 / D7)

| | |
|---|---|
| **Etat** | **Ni `helmet` ni rate limit dans `server/src`** (verifie : 0 occurrence). Aucun en-tete de securite HTTP, aucune limitation sur `/auth/login`. |
| **Risque** | Le brute force sur le mot de passe n'est pas freine. Les en-tetes de securite standard du navigateur ne sont pas poses. |
| **Report decide** | Volontairement reporte **apres la presentation** : ajouter une couche HTTP la veille d'une demonstration, sans tests automatises, presente plus de risque de panne qu'elle n'en supprime. |
| **Quand le faire** | A l'installation reelle, avant exposition hors reseau interne. Cible : `helmet` en global + rate limit sur `/auth/login` uniquement. |

---

## 3. REPORTS TECHNIQUES (non bloquants pour la demonstration)

### 3.1 - Numerotation des bons non atomique (A6)

| | |
|---|---|
| **Etat** | `server/src/services/bonService.ts`, lignes 11-21. Le `count` servant a construire le numero (`BE/BL/BS-<annee>-<n+1>`) est lu **hors transaction**, sans verrou. |
| **Risque** | Deux creations simultanees peuvent obtenir le meme numero. En demonstration mono-utilisateur : non declenchable. |
| **Correctif ecrit et teste** | Un verrou `pg_advisory_xact_lock(annee, type)` pris dans la transaction. Le verrou a ete **verifie sur la base** (appels 1, 2, 3 : un seul acquiert, les autres attendent ; donnees inchangees). Le correctif n'est simplement pas applique. |
| **Quand le faire** | Des la premiere utilisation reelle a plusieurs postes. |

### 3.2 - Branche `COMMANDER` inatteignable dans la cascade des seuils (D1)

| | |
|---|---|
| **Etat** | `server/src/services/stockService.ts`, ligne 67. Le libelle `COMMANDER` prevu par le cahier des charges (M9) ne peut pas etre produit par le code actuel. |
| **Cause** | La cascade compare le stock disponible a des seuils qui ne se recoupent pas sur les donnees actuelles : sur les 22 articles, on obtient `RUPTURE IMMINENTE`, `ALERTE` et `SURSTOCK`, jamais `COMMANDER`. |
| **Report decide** | Laissée en l'etat. **A signaler en presentation** si la question des seuils vient. |

### 3.3 - `strict` absent du tsconfig client (A13 / D6)

| | |
|---|---|
| **Etat** | `client/tsconfig.app.json` n'a pas `strict`, alors que `docs/05_ARCHITECTURE.md` affirme que les deux projets sont en mode strict. Le serveur, lui, est bien en `strict` + `noUnusedLocals` + `noUnusedParameters`. |
| **Consequence** | Le client tolere des `null` / `undefined` non verifies : une erreur de ce type ne serait pas signalee a la compilation. |
| **Quand le faire** | Apres la demonstration, avec un budget de corrections : le mode strict revele des erreurs laisseees depuis le debut. |

> **PIEGE DE VERIFICATION - a lire avant de controler une compilation client.**
>
> `client/tsconfig.json` est un **fichier solution** : il contient `files: []` et seulement
> des `references` vers `tsconfig.app.json` et `tsconfig.node.json`.
>
> La commande `npx tsc --noEmit -p tsconfig.json` **verifie ZERO fichier et renvoie exit 0**.
> Un « exit 0 » obtenu ainsi ne prouve **rien** : c'est le silence, pas une reussite.
>
> Les commandes correctes sont :
> - `npx tsc -b` (celle utilisee par `npm run build --workspace client`) ;
> - ou `npx tsc -p tsconfig.app.json --noEmit`.
>
> Controle effectu : `tsc -b --force` et `tsc -p tsconfig.app.json` passent tous deux en
> exit 0, **114 fichiers** verifies pour le projet applicatif. La compilation client est donc
> reellement saine, mais elle ne l'a ete prouvee qu'apres avoir utilise la bonne commande.

### 3.4 - N+1 dans `stockWithThresholds` : les deux ecrans du tableau de bord sont lents (A15)

| | |
|---|---|
| **Etat** | `server/src/services/stockService.ts`, lignes 194-224. La boucle `for (const [articleId, quantity] of byArticle)` execute **deux requetes sequentielles par article**, avec un `await` a chaque tour :<br>1. `prisma.article.findUnique(...)` (ligne 205) ;<br>2. `computeThresholds(...)` (ligne 210), qui appelle lui-meme `monthlyConsumption(articleId)` (ligne 55), donc une troisieme requete.<br>Soit environ **3 allers-retours par article, sequentiels** : ~66 requetes pour 22 articles. |
| **Effet mesure** | `/dashboard/kpis` : **150 ms** en moyenne. `/dashboard/alerts` : **119 ms**. Toutes les autres routes sont a 10-25 ms (`/articles` 13 ms, `/lots` 11 ms, `/valuation` 25 ms). |
| **Percu** | Le tableau de bord met une fraction de seconde a charger. Aucun bloque fonctionnel : c'est lent, pas faux. |
| **Correctif** | Regrouper les lectures : un seul `prisma.article.findMany({ where: { id: { in: [...] } } })` au lieu de 22 `findUnique`, et un seul `monthlyConsumption` groupe par article au lieu de 22. Ramenerait ~66 requetes a 2 ou 3, **sans changement de resultat** (meme formule, meme ordre). |
| **Piste deja amorcee** | Le cache de 5 s sur les parametres de seuils (lignes 26-29) montre que le probleme a ete percuto, mais **seul le cas facile a ete traite** : ni l'article ni la consommation mensuelle ne sont regroupes. |
| **DECISION PRISE** | **Documenter seulement. Aucun correctif n'est applique.** Le cout du correctif est faible et son gain immediate, mais il touche au calcul des seuils - le coeur metier - et le depot ne contient aucun test automatise pour le garantir. Une lenteur esthetique ne justifie pas ce risque la veille d'une presentation. |
| **Quand le faire** | Apres la presentation, avec un controle d'empreinte valeur par valeur sur les 22 articles avant de valider. |

> **Precaution liee a la decision D13.** Le tableau de bord a ete allege de deux blocs qui
> figuraient dans M9 : le KPI « Valorisation totale du stock », puis la carte
> « Stock par categorie ». Apres retrait, il ne reste que les 7 KPI d'exploitation.
>
> Ces retraits **ne sont pas des corrections de performance** : ils ne touchent pas au N+1
> decrit ci-dessus, qui subsiste integralement. `/dashboard/kpis` reste a ~150 ms et
> `/dashboard/alerts` a ~135 ms, et c'est toujours la cause ci-dessus. Les blocs retires
> n'etaient qu'une **consommation de requete de plus** pour l'utilisateur, dans des onglets
> ou ils restaient accessibles et exacts.
>
> Consequence a assumer en presentation : `dashboardApi.stockByCategory()` est redeclaree
> cote client (`client/src/services/endpoints.ts`) mais **n'est plus appelee par aucun ecran**.
> Son type a ete corrige en cours de session (`unit` etait absent du type alors que l'API le
> renvoie) : la declaration est donc correcte, mais morte.

### 3.5 - Modeles Prisma non alimentes (A14 / D8)

| Modele | Etat | Effet |
|---|---|---|
| `ArticleOrder` | Lu dans `stockService.encours()` (ligne 227), **jamais ecrit**. | `encours` vaut toujours 0. C'est coherent avec le blocage dur des reservations M13 (le stock virtuel est structurellement egal au stock disponible : 0 ecart sur les 22 articles). |
| `ArticleConsumption` | 0 usage Prisma : la consommation mensuelle est calculee a la volee dans `articleService.monthlyConsumption` (ligne 173) par agregation des `Move` de type `SORTIE`. | Modele redondant, sans impact fonctionnel. |
| `NotificationAlert` | 0 usage. | Modele prevu pour des alertes externes, explicitement **hors perimetre V1**. |

Aucun de ces modeles ne provoque d'erreur : ce sont des tables vides, pas des bugs.

---

## 4. ETAT DE LA BASE AU MOMENT DE LA PREPARATION

Aucune modification de donnee n'a ete effectuee pendant la session de preparation.
Toutes les corrections ont porte sur le code et la documentation.

| | |
|---|---|
| Articles | 22 |
| Lots visibles | 17 (epuises exclus des listes) |
| Mouvements | 136 (dont **74** sur les 30 derniers jours : c'est le chiffre du KPI, pas le total) |
| Valorisation totale | **4 095 778 DZD** (onglet Valorisation). **Ce chiffre n'est repris ni en KPI ni en carte du tableau de bord**, voir 3.4 |
| Reservations | 3 (`RSV-2026-0001` ACTIF, `RSV-2026-0002` ACTIF, `RSV-2026-0003` REALISE) |
| Campagnes d'inventaire | 2 |
| Bons | 3 (`BE/BL/BS-2026-0001`) |
| Journal d'audit | environ 1 462 entrees, dont 135 `CONNEXION` — **conserve integralement** (decision D14) |

**Pieges a ne pas reproduire en demonstration :**
- Ne pas relancer `test-unites-api.js` ni `test-emplacement-inventaire.js` : ces scripts
  vivent hors du depot et **creent des donnees**.
- Aucun endpoint `DELETE` sur les bons : creer un bon pollue la demonstration, qui n'en
  contient que 3.
- Les flags de stock attendus sur le jeu de calibration : `RUPTURE IMMINENTE` pour
  `farine_t55` et `chapelure`, `ALERTE` pour `sucre` et `levure`, `SURSTOCK` pour
  `film_pe`, `film_pp`, `lait_poudre`. Ne pas les perturber.

---

## 5. COMPTES DE LA DEMONSTRATION

| Compte | Mot de passe | Profil | Ecran d'accueil |
|---|---|---|---|
| `admin` | `admin2026` | `ADMIN` — 29 droits | Tableau de bord |
| `magasinier` | `magasinier2026` | `MAGASINIER` — 12 droits | Tableau de bord |
| `direction` | `direction2026` | `TOP_MANAGEMENT` — 9 droits | Tableau de bord |
| `ventes` | `ventes2026` | `SALES_ADMIN` — 7 droits | **Etat de stock** (D19) |

Les mots de passe sont volontairement identiques et documentes ici : c'est un jeu de
demonstration, pas un environnement de production. **Ils sont a changer a l'installation
reelle**, ainsi que `JWT_SECRET` (`.env`).

**Comptes `direction` et `ventes` : ils ne sont pas crees par le seed.** Ils ont ete
crees via l'ecran Utilisateurs apres les migrations D16 et D19. Sur une base neuve,
`prisma migrate deploy` insere les lignes de Role, mais les comptes restent a creer a la
main depuis l'ecran Utilisateurs (ou `POST /users`). C'est le seul ecran qui permette de
creer un compte : les deux profils ne peuvent pas se creer eux-memes.

**Verifier `ventes` a la demonstration** (D19) : le menu doit afficher exactement
5 entrees (Etat de stock, Article, Mouvement, Lots & peremptions, Reservation) et la
connexion doit atterrir sur **Etat de stock**, pas sur le tableau de bord. Sur une
reservation `ACTIF`, le bouton **Annuler** est present et le bouton **Valider** est
absent ; c'est la difference visible entre `reservation:write` et `reservation:decide`.
