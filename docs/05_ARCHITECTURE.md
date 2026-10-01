# GD TRADING - ARCHITECTURE DE L'APPLICATION (ETAPE 6 - REV 1)

**Statut :** EN ATTENTE DE VALIDATION
**Date :** 18/09/2026
**Base :** `docs\03_CAHIER_DES_CHARGES.md` (valide) + decisions d'architecture validees (TS + Prisma, bons tels quels en V1)

---

## 0. DECISIONS D'ARCHITECTURE VALIDEES

| Ref | Decision |
|---|---|
| A1 | **TypeScript** cote serveur ET cote client (typage strict des donnees) |
| A2 | **Prisma ORM** pour l'acces aux donnees PostgreSQL (migrations + client type) - plus de SQL ecrit a la main |
| A3 | Authentification : login + mot de passe (hache), sessions JWT, **droits par profil** ADMIN / MAGASINIER / TOP_MANAGEMENT (D16) - matrice unique dans `server/src/auth/permissions.ts`, 28 permissions |
| A4 | Bons (M8) : **en V1, l'application les enregistre tels quels (saisie des donnees, sans impression conforme)** ; reconformite prevue en V2 |
| A5 | IA Gemini : hors V1 (V2) |
| A6 | Hebergement uniquement sur le reseau local de l'entreprise |

---

## 1. VUE D'ENSEMBLE

Architecture **3 tiers** (monorepo) :

```
                    RESEAU INTERNE (LAN)
  +-----------------------------------------------------------------+
  |  NAVIGATEUR (poste magasinier / admin)                          |
  |  Application web React.js + TypeScript (SPA)  ->  Frontend      |
  +----------------------------------+-------------------------------+
                                   | HTTP / HTTPS (API REST, JSON)
                                   |
  +--------------------------------v-------------------------------+
  |  SERVEUR LOCAL                                                |
  |  Node.js + Express.js + TypeScript ->  API REST                |
  |    - Authentification et sessions (JWT)                        |
  |    - Controle d'acces par droit (requirePermission, D16)         |
  |    - Regles metier (mouvements, seuils, inventaire, prets...)   |
  |    - Journal d'audit (M10)                                      |
  |    - Acces aux donnees : PRISMA ORM (client type securise)      |
  +---------------------------------+-------------------------------+
                                   | Prisma Client -> SQL genere
                                   |
  +--------------------------------v-------------------------------+
  |  PostgreSQL  ->  Base de donnees (schema gere par Prisma)      |
  |    - Migrations prisma (prisma migrate)                         |
  |    - Contraintes d'integrite, transactions                      |
  +-----------------------------------------------------------------+
```

**Stack retenue :**

| Couche | Technologie |
|---|---|
| Frontend | React.js + **TypeScript** (HTML5, CSS3) |
| Backend | Node.js (v24) + Express.js + **TypeScript** |
| BDD | PostgreSQL 16+ |
| ORM | **Prisma ORM** (schema.prisma + Prisma Client + migrations) |
| API | REST + JSON |
| Auth | JWT (jeton), mot de passe hache (bcrypt) |
| Bons | V1 : enregistrement simple, sans PDF conforme (A4) |
| IA | Gemini : V2 (A5) |
| Validation donnees | Validation cote serveur (types TypeScript + validation runtime) |

---

## 2. ORGANISATION DES DOSSIERS (monorepo)

```
C:\Users\Y.DROUICHE\Documents\Default Project\
├── docs\                          # Tous les documents du projet
├── server\                        # Backend Node.js + Express + TypeScript + Prisma
│   ├── prisma\
│   │   ├── schema.prisma          # Modèle de donnees (docs\06) - source de verite
│   │   ├── migrations\            # Migrations generees par `prisma migrate`
│   │   └── seed.ts                # Donnees initiales (roles, utilisateurs, parametres)
│   ├── src\
│   │   ├── index.ts               # Demarrage du serveur
│   │   ├── app.ts                 # Configuration Express (middlewares, routes)
│   │   ├── config\                # Configuration (.env, constantes)
│   │   ├── prisma.ts              # Instance Prisma Client (singleton)
│   │   ├── routes\                # Routage REST par module (coquille)
│   │   ├── controllers\           # Traitement requetes (validation + appel services)
│   │   ├── services\              # Regles metier (stock, seuils, inventaire, prets, valorisation)
│   │   ├── middlewares\           # auth (JWT), rbac (roles), error-handler, audit
│   │   ├── validators\            # Validation runtime des entrees (schemas)
│   │   ├── types\                 # Types TypeScript partages (interfaces, enums)
│   │   └── utils\                 # Helpers (dates, numerotation, calculs)
│   ├── .env                       # DATABASE_URL, JWT_SECRET, PORT (jamais commité)
│   ├── tsconfig.json
│   └── package.json
├── client\                        # Frontend React + TypeScript
│   ├── public\
│   ├── src\
│   │   ├── main.tsx               # Point d'entree
│   │   ├── App.tsx                # Routage applicatif
│   │   ├── pages\                 # Ecrans (Login, EtatStock, Mouvements, Articles, Inventaire, Prets, Dashboard...)
│   │   ├── components\            # Composants reutilisables (DataTable, FormDialog, Badge alertes...)
│   │   ├── services\              # Appels API (fetch vers /api/...)
│   │   ├── context\               # Contexte utilisateur (session JWT)
│   │   ├── types\                 # Types partages (reutilises de la doc 06)
│   │   └── utils\
│   ├── tsconfig.json
│   └── package.json
└── scripts\                       # Scripts Python de migration Excel -> PostgreSQL
```

---

## 3. PRISMA ORM - PRINCIPES

1. **schema.prisma** = source de verite du modele de donnees (tables, relations, enums, index) - voir `docs\06` (section 2 au format Prisma).
2. **Migrations** : `prisma migrate dev --name "..."` genere et applique le SQL (CREATE TABLE, index, contraintes) de facon versionnee. Plus d'ecriture manuelle de DDL.
3. **Prisma Client** : acces aux donnees type et securise :
   - `prisma.movement.create({ data, ... })`,
   - `prisma.movement.findMany({ where, include, ... })`,
   - `prisma.$transaction([...])` pour les operations tout-ou-rien (transfert, inventaire, pret).
4. **Seed** : utilisateurs initiaux (1 admin + compte magasinier) et parametres par defaut (seuils 9 / 21 / 0,5 / 1,05 / 30j).
5. **Pas de SQL brut** : les requetes metier passent par le client Prisma (securite injection).

---

## 4. API REST (principaux endpoints)

Prefixe commun : `/api`

| Module | Methodes / routes |
|---|---|
| Auth | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| Utilisateurs | `GET/POST /users`, `PUT /users/:id`, `PUT /users/:id/password`, `PATCH /users/:id/status` (admin) |
| Articles | `GET /articles` (filtres), `GET /articles/:id`, `POST /POST /articles`, `GET /articles/:id/consumption` |
| Mouvements | `GET /movements`, `POST /movements`, `PATCH /movements/:id/cancel` (admin), `GET /movements/lots/:lotId/history` |
| Etat des stocks | `GET /stock`, `GET /stock/article/:id`, `GET /stock/depot/:id`, `GET /stock/lots` |
| Lots / peremptions | `GET /lots?flag=red|orange|green`, `POST /lots`, `GET /lots/:id` |
| Inventaire | `GET/POST /inventories`, `POST /inventories/:id/lines`, `POST /inventories/:id/lines/:line/validate`, `POST /inventories/:id/close` |
| Prets | `GET/POST /loans`, `POST /loans/:id/restitution`, `GET /loans/synthesis`, `GET /loans/balances` |
| Reservations | `GET/POST /reservations`, `GET /reservations/synthesis`, `GET /reservations/availability/:articleId`, `GET /reservations/:id`, `POST /reservations/:id/valider`, `POST /reservations/:id/annuler` |
| Valorisation | `GET /valuation`, `PUT /articles/:id/unit-price` |
| Bons | `GET/POST /bons` (enregistrement simple - A4) |
| Tableau de bord | `GET /dashboard/kpis`, `GET /dashboard/alerts`, `GET /dashboard/lots-flags` |
| Audit | `GET /audit` (filtres) |
| Parametres | `GET/PUT /settings` (seuils 9/21/0,5, 1,05, alerte 30j) |
| Referentiels | `GET /referential/families`, `/categories`, `/units`, `/packaging`, `/depots`, `/locations`, `/partners`, `/origins` (CRUD admin) |

---

## 5. AUTHENTIFICATION ET SECURITE

1. **Login** : identifiant + mot de passe stocke **hache** (bcrypt) - jamais en clair.
2. **Sessions** : JWT delivre a la connexion, envoye a chaque requete, expiration configurable.
3. **Droits (D16, D19)** : le controle ne porte plus sur le role mais sur un **droit** (`requirePermission`). La matrice `ROLE_PERMISSIONS` de `server/src/auth/permissions.ts` est l'unique source de verite ; le serveur renvoie la liste des droits de l'utilisateur dans `permissions[]` sur `/auth/login` et `/auth/me`, et le client n'en recalcule aucun. Voir M11 du cahier des charges.
4. **Redirection d'ecran (D19)** : la garde `RequirePermission` redirige vers le **premier ecran autorise** du menu (`firstAllowedPath`), jamais en dur vers `/`. Un profil sans `dashboard:read` bouclerait sinon sur la page d'accueil, qui exige le droit qui lui manque. Si le profil n'a droit a aucun ecran, un ecran « Acces refuse » est affiche plutot qu'une boucle.
5. **Acces** : le serveur n'ecoute que sur le reseau local (pas d'exposition Internet).
6. **Audit** : toute action enregistree (M10) avec l'utilisateur connecte (middleware global).
7. **Validation des entrees** : schemas de validation cote serveur (types + validation runtime), jamais de confiance sur le frontend.
8. **Secrets** : fichier `.env` non committe (DATABASE_URL, JWT_SECRET).

---

## 6. GESTION DES ERREURS ET DE LA COHERENCE

- **Transactions Prisma** (`$transaction`) : operations multi-ecritures tout-ou-rien (TRANSFERT, inventaire, pret).
- **Contrainte de stock** : SORTIE / PERTE verifient la disponibilite par lot (0.4 > bloquer) avant insertion.
- **Erreurs API** : format JSON `{ "error": true, "code": "CODE", "message": "..." }`.
- **Validation metier** : doublons (lot, designation), quantites <= 0, dates incoherentes rejetees.

---

## 7. SAUVEGARDES (BACKUP)

- Sauvegarde journaliere de PostgreSQL (pg_dump) sur le serveur + support externe.
- Les migrations Prisma sont versionnees dans `prisma\migrations` (le schema est reconstruisible).

---

## 8. ENVIRONNEMENT DE DEVELOPPEMENT

- Windows 10/11 local : Python 3.14.7 (scripts migration Excel), Node.js v24.21.0, npm 11.19.0.
- PostgreSQL 16+ a installer sur le serveur local.
- Prisma CLI integree au backend (npm).
- Navigateur cible : Chrome / Edge.

---

## 9. AVANT-PROPOS V1 DES BONS (A4)

- Le module M8 en V1 **enregistre les bons** (saisie : type, REF auto, dates, depot source/destination, acteurs, lignes articles/lots/quantites, observation) **sans generation d'impression conforme**.
- Les bons restent utilises **tels quels** (feuilles Excel/manuel) jusqu'a la reconformite en V2 (impression PDF avec en-tete officiel, numeros de serie, etc.).