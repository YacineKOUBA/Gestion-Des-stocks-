# GD TRADING - CAHIER DES CHARGES FONCTIONNEL (VERSION 1)

**Statut :** Document fonctionnel (Etapes 3, 4 et 5 de la methode) - **EN ATTENTE DE VALIDATION**
**Date :** 18/09/2026
**Base :** `docs\01_ANALYSE_FONCTIONNELLE.md` (validee) + `docs\02_VALIDATION_ANALYSE.md` (reponses du directeur)

---

## 0. REGISTRE DES DECISIONS VALIDEES

| Ref | Decision | Source |
|---|---|---|
| D1 | Consolider tout l'historique des mouvements (JOURNAL E-S + JOURNAL E-S (2)) dans un journal unique | doc2 |
| D2 | STOCK DISPONIBLE recalcule automatiquement depuis les mouvements (entrees - sorties) | doc2 |
| D3 | Consommation mensuelle calculee automatiquement depuis les sorties du journal | doc2 |
| D4 | Module proposition d'achat / reapprovisionnement : HORS V1 (a integrer en V2) | doc2 |
| D5 | Deux niveaux de localisation : Etablissement (ALGER, BLIDA 1, BLIDA 2, CONSTANTINE, EXTERIEUR) + Emplacement interne (DEPOT 1, DEPOT 2, DEPOT 1&2, EXTERIEUR, FERMENT) | doc2 |
| D6 | Inventaire physique GENERAL 1 FOIS PAR MOIS (tous depots) | doc2 |
| D7 | Prix unitaire de valorisation : saisi manuellement par article, modifiable apres saisie | doc2 |
| D8 | Module dedie PRETS / EMPRUNTS avec restitution et solde par client | doc2 |
| D9 | Perimetre V1 = STOCK UNIQUEMENT (personnel et equipement hors V1) | doc2 |
| D10 | Mouvement TRANSFERT entre depots (sortie depot source + entree depot destination) | doc2 |
| D11 | D7 completee : la valorisation est calculee au cout moyen pondere et le prix est porte par le LOT (saisi a la creation du lot, il le suit toute sa vie) ; le prix de l'article n'est qu'un repli pour les lots sans prix propre | avenant a D7 |
| D12 | Module RESERVATION ajoute au perimetre V1 (M13) : blocage de stock FEFO, avec validation, annulation manuelle et expiration automatique | complement V1 |
| D13 | Ecart assume sur M9 : le tableau de bord ne presente QUE les 7 KPI d'exploitation, sans aucun bloc « stock total ». Les trois exigences complementaires de M9 ne sont pas livrees au tableau de bord : (a) la valorisation totale du stock ; (b) le regroupement par FAMILLE ; (c) la carte « stock par categorie » (le tableau ne regroupe par categorie que dans l'onglet Valorisation et via l'endpoint /dashboard/stock-by-category). Ces trois blocs restent accessibles et exacts dans leurs onglets/API dedies | ecart doc/ecran assume |
| D14 | Le journal d'audit n'est jamais purge (ni automatiquement ni manuellement) ; toute purge future doit etre ciblee (action, periode, motif) et tracee | regle de conservation |
| D15 | Terminologie : le mot « partenaire » est remplacé par « ACTEUR » dans toute l'interface (libelles de champs, en-tetes de colonnes, messages d'erreur) et dans les documents 02/03/05/06. C'est le terme du fichier Excel source (colonne `ACTEUR`), « partenaire » n'en étant que la glose. `docs/01` reste inchangé : il transcrit le fichier Excel. **Le nom technique reste `Partner`** (table `partners`, modele Prisma, `partnerId`, `model: 'partner'` dans l'URL du referentiel) : aucune migration n'est necessaire | harmonisation de vocabulaire |
| D16 | Profil **TOP_MANAGEMENT** ajoute, libelle « **Direction generale** » (le directeur l'avait ecrit « Top Managment ») : **consultation seule, aucun droit d'ecriture**, sur les 9 ecrans listes : tableau de bord, etat de stock, article, mouvement, lot et peremption, inventaire, pret/emprunt, reservation, valorisation. Ecrans **absents de la liste, donc exclus, appliques a la lettre** : Document (bons), Referentiel, Utilisateurs, Parametres, et **Journal d'audit** — ce dernier point n'a pas ete souleve aupres du directeur. Le profil recoit 9 des 28 droits, soit **strictement moins que le `MAGASINIER`** (12) : aucun acces nouveau n'est cree pour qui que ce soit, et le nouveau profil ne peut rien ecrire | demande directeur |
| D17 | Le profil **MAGASINIER perd l'acces aux ecrans Pret/Emprunt et Reservation** (retrait de `loan:read`, `loan:write`, `reservation:read`, `reservation:write`) : il passe de 15 a 12 droits. Consequences appliques : (a) la carte « Prets / emprunts en cours » du tableau de bord n'est plus interrogee ni affichee pour ce profil, faute de quoi l'appel echouerait en 403 ; (b) le champ `prets` de `/dashboard/alerts`, **non consomme par aucun ecran**, est supprime, sinon les prets lui parviendraient malgre le retrait d'acces. **Regression D16 corrigee** : `referential:read` lui est rendu (ses formulaires de saisie de mouvement et de bon lisent depots, emplacements et acteurs ; sans ce droit ils etaient casses), et un nouveau droit `referential:manage` separe la *lecture des listes* de l'*acces a l'ecran Referentiel*, qui reste absent de son menu comme avant | demande directeur |
| C1 | Traçabilite des inventaires et declaration des pertes | doc2 |
| C2 | Gestion des lots : role primordial | doc2 |
| C3 | Nouvelle categorie d'article : PIECE DE RECHANGE (en plus d'EMBALLAGE, EQUIPEMENT, MATIERE PREMIERE) | doc2 |
| C4 | Traçabilite complete : qui a ajoute / supprime / modifie quoi | doc2 |
| P1 | Role MAGASINIER : saisir entrees, sorties, consulter etat, saisir inventaire | doc2 |
| P2 | Role ADMIN : tout magasinier + validation/annulation, utilisateurs et roles, parametres, valorisation et rapports | doc2 |

---

## 1. CONTEXTE ET OBJECTIFS

L'application web interne **GD Trading** remplace le fichier Excel `GD TRADING - GESTION DES STOCKS (2).xlsx`. Elle est hebergee sur un serveur local et accessible depuis le reseau de l'entreprise.

Objectif : fiabiliser et centraliser la gestion de stock avec :
- un journal de mouvements unique et trace ;
- des stocks toujours recalcules depuis les mouvements ;
- une gestion des lots et peremptions rigoureuse (decision C2) ;
- un inventaire mensuel avec traçabilite et declaration des pertes (D6, C1) ;
- une traçabilite totale des actions utilisateurs (C4).

---

## 2. PERIMETRE DE LA VERSION 1

### 2.1 Modules inclus en V1

| Module | Description |
|---|---|
| M1 | Referentiel articles (avec nouvelle categorie PIECE DE RECHANGE) |
| M2 | Journal des mouvements (entre, sortie, transfert, perte, ajustement) |
| M3 | Etat des stocks (par article, depot, emplacement, lot) |
| M4 | Gestion des lots et peremptions |
| M5 | Inventaire physique mensuel + ecarts + declaration des pertes |
| M6 | Prets / emprunts / restitutions |
| M7 | Valorisation du stock (prix porte par le lot, cout moyen pondere) |
| M8 | Bons de sortie/transfert (enregistrement simple V1, reconformite V2) |
| M9 | Tableau de bord (KPIs et alertes) |
| M10 | Traçabilite / journal d'audit |
| M11 | Utilisateurs, profils et droits (Admin / Magasinier / Direction generale) |
| M12 | Parametres et referentiels (admin) |
| M13 | Reservations de stock (blocage FEFO, validation / annulation / expiration) |

### 2.2 Hors perimetre V1 (reported en V2 ou exclu)

- Proposition d'achat / reapprovisionnement (CONS. PRODUIT, RUBAN ADHESIF) - decision D4.
- Personnel : permanence, heures supplementaires, manutention - decision D9.
- Equipement (registre) - decision D9.

---

## 3. SPECIFICATIONS FONCTIONNELLES PAR MODULE

### M1 - REFERENTIEL ARTICLES

**Sources Excel :** PRODUIT, BD.

**Fiche article - champs :**

| Champ | Type | Regles |
|---|---|---|
| Code article | Nombre | Serie par categorie (100xxx = EMBALLAGE, 200xxx = MATIERE PREMIERE, 300xxx = PIECE DE RECHANGE, EQUIPEMENT : a definir). Attribution automatique, modifiable par admin | A VALIDER |
| Designation | Texte obligatoire | Unique (nom de reference) |
| Designation2 | Texte | Code additif (ex. E300, E472) |
| Fabricant | Texte | |
| Emploi GD | Liste | PRODUCTION / REVENTE EN L'ETAT / MIXTE |
| Categorie | Liste | MATIERE PREMIERE / EMBALLAGE / EQUIPEMENT / **PIECE DE RECHANGE** (C3) |
| Famille | Liste (43 +) | Gerable par admin (M12) |
| Application | Texte | Ex. BOISSONS-CONFITURE-COSMETIQUE-PHARMA |
| Unite de mesure | Liste | KG / UNITE / LITRE / ML / PIECE |
| Conditionnement | Texte / liste | Ex. CARTON, BOBINE, SACHET |
| Source (achat) | Liste | INTERNATIONAL / LOCAL / MIXTE / NON DEFINI |
| Origine | Liste | Pays / continents (BD) |
| Periode / Frequence | Liste | ANNUELLE(360) / BIMESTRIELLE(180) / TRIMESTRIELLE(90) / MENSUELLE(30) / ... |
| Statut | Liste | ACTIVE / INACTIVE |
| Prix unitaire | Decimal | Saisi manuellement, **modifiable** (D7) - **repli** : ne sert que pour les lots sans prix propre (D11) |
| Stock disponible, stock virtuel, seuils | Calcule | Ne sont pas saisis (voir M3) |

**Regles :**
1. Le code article est unique et obligatoire.
2. Consommation mensuelle (12 mois) **calculee** depuis les sorties du journal (D3) : somme des sorties de l'article par mois calendaire (historique glissant).
3. Un article ne peut etre supprime s'il a des mouvements ; il est desactive (statut INACTIVE).
4. La creation / modification est tracee (C4).

---

### M2 - JOURNAL DES MOUVEMENTS

**Sources Excel :** JOURNAL E-S, JOURNAL E-S (2) (fusion des 2 - D1), INVENTAIRE (partiel), BON.

**Types de mouvement (V1) :**

| Type | Effet sur stock | Sens |
|---|---|---|
| ENTREE (reception) | + quantite | + |
| SORTIE (livraison) | - quantite | - |
| TRANSFERT | - dans depot/emplacement source, + dans depot/emplacement destination | +/- |
| PERTE (C1) | - quantite | - |
| AJUSTEMENT (inventaire) | + ou - quantite (corrige l'ecart valide) | +/- |
| PRET / EMPRUNT / RESTITUTION | geres par le module M6 (lien a definir - voir 0.1) | A VALIDER |

**Champs d'un mouvement :**
- Date du mouvement (obligatoire)
- Article (obligatoire, liste) -> code, famille, unite recuperes de la fiche
- Type (obligatoire, liste)
- Quantite > 0 (obligatoire)
- Sens : calcule selon type
- Unite de mesure
- **Lot, date de fabrication, date d'expiration** (C2) : lot obligatoire pour article lot-trace (article perissable ou a lot) | A VALIDER
- Depot (etablissement) + Emplacement interne (D5)
- Acteur (fournisseur pour entree, client pour sortie)
- Piece (numero de document : livraison, bon, facture...)
- Prix unitaire d'achat (entrees) - alimente la valorisation si besoin
- Observation
- Cree par / cree le (automatique - C4)

**Regles :**
1. Un mouvement ENTREE / SORTIE / PERTE / AJUSTEMENT porte sur 1 article, 1 lot, 1 depot, 1 emplacement.
2. Une SORTIE / PERTE** ne peut pas faire passer un stock par lot negatif** (quantite disponible insuffisante pour ce lot) - a confirmer | A VALIDER.
3. TRANSFERT = une seule saisie, cree 2 lignes (sortie source + entree destination), meme date, meme lot.
4. Annulation : uniquement par un admin, jamais de suppression "physique" ; le mouvement est annule (statut ANNULE) et trace (P2, C4).
5. Les entrees de l'historique Excel sont conservees (D1) dans le journal migre.

---

### M3 - ETAT DES STOCKS

**Sources Excel :** ETAT DES STOCKS, ETAT STOCK, PRODUIT.

**Vues :**
1. Par article (agrege tous depots) : stock disponible, encours (arrivages), stock virtuel, couverture (jours), date probable d'epuisement, seuils, observation.
2. Par article x depot x emplacement x lot : quantite par lot, date expiration.
3. Seuils : STOCK SECURITE, STOCK MIN, STOCK ALERTE, STOCK MAX (calcul M3bis).

**Calculs (conserves de l'Excel) :**

| Indicateur | Formule |
|---|---|
| STOCK DISPONIBLE | somme des SENS des mouvements non annules, par article x depot x emplacement x lot |
| ENCOURS (arrivage) | commandes en cours saisies sur la fiche article (date d'arrivee prevue) |
| STOCK VIRTUEL | STOCK DISPONIBLE + ENCOURS |
| CONS. (J) | C.MAX.MOIS / 30 |
| C.MAX.MOIS | MAX(consommation mensuelle sur 12 mois) |
| CONS. REELLE MOIS | MOYENNE(consommation mensuelle sur 12 mois) |
| STOCK SECURITE (unites) | (CONS. REELLE MOIS / 30) x PARAM(9 jours) |
| STOCK MIN (unites) | (CONS. REELLE MOIS / 30) x PARAM(21 jours) |
| STOCK ALERTE | STOCK SECURITE + STOCK MIN |
| STOCK MAX (unites) | C.MAX.MOIS x (1 + PARAM(0,5)) |
| COUV. STOCK (jours) | STOCK DISPONIBLE / CONS. (J) |
| DATE PROBABLE RUPTURE | Aujourd'hui + (COUV. STOCK x PERIODE / FREQUENCE) |
| OBSERVATION | Classement du stock face aux seuils (voir M9) |

Les PARAM (9, 21, 0,5) sont modifiables par l'admin (M12).
Note : le coefficient "x 1,05" present dans l'ETAT DES STOCKS Excel est conserve en V1 (decision validee 0.5 > (b)) : STOCK ALERTE x 1,05 est utilise pour le classement de l'observation.

---

### M4 - GESTION DES LOTS ET PEREMPTIONS (C2)

**Sources Excel :** GESTION LOTS, Feuil2, ETAT STOCK.

**Fonctions :**
1. Chaque stock est suivi par lot (quantite par lot, date de fabrication, date d'expiration).
2. Vues de peremption :
   - PRODUITS PERIMES (date expiration < aujourd'hui) ;
   - expiration dans moins de 6 mois ;
   - entre 6 mois et 12 mois ;
   - au-dela de 12 mois.
3. Alerte automatique avant peremption : jours avant expiration (parametre M12) - valeur par defaut : **30 jours** (decision validee 0.6).
4. Un lot ne peut pas etre saisi en doublon pour un meme article (meme numero de lot + meme date d'expiration).
5. Historique des lots : toutes les entrees/sorties d'un lot sont consultables (traçabilite).

---

## 3. SPECIFICATIONS FONCTIONNELLES PAR MODULE (suite)

### M5 - INVENTAIRE PHYSIQUE MENSUEL (D6, C1)

**Sources Excel :** INVENTAIRE, Feuil1.

**Principe :**
1. A chaque debut/mois ou a la demande, l'admin ouvre une **campagne d'inventaire** : depot(s) + emplacement(s) + date.
2. Le magasinier saisit les **quantites physiques comptees** par article x lot x depot x emplacement.
3. L'application affiche le **stock theorique** (calcule) a cote du **stock physique** saisi et l'**ecart** = physique - theorique.
4. Validation par l'admin :
   - ecart = 0 : rien a faire ;
   - ecart > 0 ou < 0 : choix du magasinier/admin -> generer un mouvement **AJUSTEMENT** (correction du stock) ou declarer une **PERTE** (perte, casse, vol) avec motif obligatoire ;
   - le mouvement genere est tage "origine = inventaire n", date de la campagne.
5. Chaque saisie / modification / validation est tracee : qui a compte, qui a valide, quand (C4).
6. Historique complet des campagnes : toutes les quantites theoriques, comptees et ecarts sont conserves (traçabilite des inventaires - C1).

**Regles :**
- Un article non repere lors du comptage => quantite physique = 0 (ecart negatif a traiter).
- Une campagne cloturee ne peut plus etre modifiee ; une nouvelle campagne est ouverte.

---

### M6 - PRETS / EMPRUNTS / RESTITUTIONS (D8)

**Source Excel :** SITUATION, PRET-RESTITUTION-EMPRUNT.

**Principes :**
1. Operation PRET : marchandise sortie temporairement vers un client (beneficiaire).
2. Operation EMPRUNT : marchandise recue temporairement.
3. Operation RESTITUTION : retour de la marchandise, **toujours rattachee a une operation existante** (correction validee). Deux sous-types :
   - RESTITUTION PRET : retour de la marchandise precedemment pretee ;
   - RESTITUTION EMPRUNT : retour de la marchandise precedemment empruntee.

**Impact sur le stock (decision validee 0.1 > (a)) :** le PRET sort du stock disponible (mouvement de sortie lie), l'EMPRUNT entre dans le stock, la RESTITUTION reintegre la quantite pretee / retire la quantite empruntee. Chaque operation de stock est liee a son operation de pret/emprunt pour traçabilite.

**Champs :** client (acteur), operation, date, article/produit, quantite, unite, observation (ex. "A RESTITUER (ECHANGE)", "DEPOTAGE").

**Solde par operation :** SOLDE = quantite pretee/empruntee - quantite restituee. Un client a "A RESTITUER" tant que son solde > 0.

**Synthèse :** volume PRET / EMPRUNT / RESTITUTION par unite (comme PRET-RESTITUTION-EMPRUNT).

---

### M7 - VALORISATION DU STOCK (D7, D11)

**Sources Excel :** VALEUR, VALORISATION.

**Principe :**
1. Le prix unitaire de reference est **saisi manuellement** sur la fiche article et **modifiable** a tout moment (historique des prix conserve) (D7).
2. **Le prix est porte par le LOT** : saisi a la creation du lot, il le suit toute sa vie et prime sur le prix de l'article. Le prix de l'article n'est qu'un **repli**, applique aux seuls lots depourvus de prix propre (D11).
3. Valeur calculee au niveau du lot (article x lot x depot) :
   **VALEUR LOT = QUANTITE EN STOCK x PRIX APPLIQUE**, ou PRIX APPLIQUE = prix du lot s'il existe, sinon prix de l'article.
4. Au niveau de l'article, le prix affiche est un **cout moyen pondere** du stock restant, calcule et non saisi :
   **PRIX MOYEN = SOMME(PRIX APPLIQUE x QUANTITE) / SOMME(QUANTITE)**, et **VALEUR ARTICLE = SOMME(VALEUR LOT)**.
5. Restitution : par lot (article x lot x depot), par article (total), par famille / categorie / depot. Chaque ligne de lot precise l'origine du prix applique (LOT ou ARTICLE) et le detail du calcul est consultable.
6. Rapports : etat de valorisation (equivalent VALEUR / VALORISATION) filtrable par categorie, famille, depot, date.

---

### M8 - BONS DE SORTIE / TRANSFERT

**Source Excel :** BON.

**Decision validee (A4) :** en V1, les bons restent **tels quels** (feuilles Excel / impression actuelle). L'application les **enregistre uniquement** (donnees : type, numero REF automatique, date, depot source, depot destination pour transfert, client/fournisseur, lignes article/lot/quantite/unite/observation). La **reconformite** (impression PDF conforme avec en-tete officiel, numerotation, gestion complete) est prevue en **V2**.

**Principe V1 :**
1. Saisie d'un bon : enregistrement des donnees comme trace (M8).
2. Champs : type de bon, numero REF automatique, date, depot source, depot destination (pour transfert), client/fournisseur, lignes (article, lot, quantite, unite, observation).
3. En V1 : pas de generation d'impression conforme (V2).

---

### M9 - TABLEAU DE BORD ET ALERTES

**Source Excel :** TCD.

**KPIs (page d'accueil) :**
- Nombre d'articles references (actifs) ;
- Nombre de lots en stock ;
- Nombre de mouvements sur la periode (entrees / sorties / transferts / pertes) ;
- Quantites totals entrees / sorties sur la periode ;
- Valorisation totale du stock (**non portee au tableau de bord en V1** : consultable et exacte dans l'onglet Valorisation, voir D13) ;
- Stock total par categorie / famille (**non porte au tableau de bord en V1** : le regroupement par categorie et par unite de stockage existe cote API (`GET /dashboard/stock-by-category`) mais n'est affiche nulle part. Le regroupement par famille n'existe pas. Voir D13).

**Alertes (liste de controle) :**
- Articles sous stock : STOCK VIRTUEL <= STOCK SECURITE -> "Commander" ; <= STOCK ALERTE -> "Alerte" ; < STOCK MIN -> "Rupture imminente" ;
- Articles en surstock : STOCK VIRTUEL >= STOCK MAX ;
- Lots perimes ou arrivant a expiration (M4) ;
- **Tableau de bord par lot avec drapeaux de duree de vie** (correction validee) :
  - expiration dans moins de 6 mois -> **DRAPEAU ROUGE** ;
  - expiration entre 6 mois et 1 an -> **DRAPEAU ORANGE** ;
  - expiration a plus d'un an -> **DRAPEAU VERT** ;
- Campagne d'inventaire du mois en cours ou en retard ;
- Prets/emprunts en solde non restitue. **Carte affichee uniquement aux profils ayant le droit `loan:read`** (`ADMIN` et `TOP_MANAGEMENT`) : le `MAGASINIER` n'y a plus acces depuis D17. Le doublon `prets` que `/dashboard/alerts` renvoyait a cote de la carte a ete supprime.

---

### M10 - TRAÇABILITE / JOURNAL D'AUDIT (C4)

**Principe :** chaque action sur les donnees est enregistree automatiquement :

| Champ | Valeur |
|---|---|
| Utilisateur | login |
| Action | CREATION / MODIFICATION / SUPPRESSION / VALIDATION / ANNULATION / CONNEXION / REFUS |
| Entite | article, mouvement, inventaire, pret, parametre, utilisateur, bon |
| Identifiant | id de l'enregistrement |
| Date / heure | automatique |
| Avant / Apres | valeurs de l'enregistrement (json) |

**Regles :**
- Aucune donnee metier n'est physiquement supprimee : un mouvement annule garde son historique ;
- Le journal d'audit est consultable (admin) et non modifiable ;
- Connexion/deconnexion tracees ;
- **Aucune purge automatique ni manuelle en V1** (decision D14) : le journal est conserve integralement. Il n'est jamais nettoye par tranche d'identifiant, une purge devant etre ciblee (action, periode, motif) et tracee. Le filtre par action de l'ecran Journal suffit a naviguer dans le bruit.

---

### M11 - UTILISATEURS ET ROLES (P1, P2, D16, D17)

Trois profils. `ADMIN` et `MAGASINIER` viennent de P1/P2 ; `TOP_MANAGEMENT` a ete ajoute en **D16** sur demande du directeur general, et les droits du `MAGASINIER` ont ete retranches en **D17**.

| Fonction | MAGASINIER | ADMIN | TOP_MANAGEMENT |
|---|---|---|---|
| Consulter le tableau de bord | OUI | OUI | OUI (lecture) |
| Consulter l'etat des stocks | OUI | OUI | OUI |
| Consulter les articles | OUI | OUI | OUI |
| Creer / modifier des articles | NON | OUI | NON |
| Saisir entrees et sorties de stock | OUI | OUI | NON |
| Annuler / reactiver / supprimer un mouvement | NON | OUI | NON |
| Gerer les lots et les peremptions | OUI | OUI | CONSULTATION |
| Consulter un inventaire | OUI | OUI | OUI |
| Saisir le comptage de l'inventaire physique | OUI | OUI | NON |
| Ouvrir / decider une campagne d'inventaire | NON | OUI | NON |
| Gerer les prets / emprunts | **NON (D17)** | OUI | CONSULTATION (D16) |
| Gerer les reservations de stock | **NON (D17)** | OUI | CONSULTATION (D16) |
| Gerer les bons (ecran Document) | OUI | OUI | NON (D16) |
| Consulter la valorisation | NON | OUI | OUI (D16) |
| Gerer les utilisateurs et roles | NON | OUI | NON (D16) |
| Gerer l'ecran Referentiel | NON | OUI | NON (D16) |
| Modifier les parametres | NON | OUI | NON (D16) |
| Consulter le journal d'audit | NON | OUI | NON (D16) |

**Droits servis par l'API :** **28** pour `ADMIN`, **12** pour `MAGASINIER`, **9** pour `TOP_MANAGEMENT`.

**Mise en oeuvre (D16/D17).** Les droits sont definis en un seul endroit, `server/src/auth/permissions.ts` (matrice `ROLE_PERMISSIONS`, 28 permissions), et appliques par le middleware `requirePermission`, qui remplace l'ancien `requireRole`. Le serveur les renvoie dans `permissions[]` sur `/auth/login` et `/auth/me` : **le client ne recalcule aucun droit**, il consomme la reponse et pose une garde `RequirePermission` par ecran. La granularite est volontairement fine, pour reproduire a l'identique les droits reels du `MAGASINIER` : `movement:write` (saisie) est distinct de `movement:revise` (annuler / reactiver / supprimer) ; `inventory:count`, `inventory:write` et `inventory:decide` sont distincts.

**Trois droits de referentiel, trois intentions.** `referential:read` = lire les listes de reference ; `referential:manage` = acceder a l'ecran Referentiel ; `referential:write` = creer / supprimer une reference. `MAGASINIER` possede `referential:read` **sans** `referential:manage` : ses formulaires de saisie de mouvement et de bon ont besoin de lire les depots, emplacements et acteurs, mais l'ecran Referentiel reste absent de son menu, comme avant D16.

**Authentification :** login + mot de passe hache (jamais en clair), sessions ; acces depuis le reseau local uniquement.

Comptes de demonstration : `admin` / `admin2026`, `magasinier` / `magasinier2026`, `direction` / `direction2026` (profil `TOP_MANAGEMENT`).

---

### M12 - PARAMETRES ET REFERENTIELS (admin)

Parametres geres par l'admin :
- Seuils : jours SECURITE (9), jours MIN (21), coefficient MAXI (0,5) ;
- Seuil d'alerte peremption (jours avant expiration) ;
- Familles, categories (incl. PIECE DE RECHANGE), unites de mesure, conditionnements ;
- Depots (etablissements) et emplacements internes ;
- Origines (pays / continents), types de mouvement, types de pieces ;
- Acteurs (entites clients/fournisseurs) ;
- Series de codes articles (100xxx / 200xxx / 300xxx...).

Toute modification est tracee (C4).

---

### M13 - RESERVATIONS DE STOCK (D12)

**Module complementaire :** il ne figurait pas au cahier des charges initial ; il est livre, exploite, et a ete ajoute au perimetre V1 (D12). Il se distingue de M6 (prets / emprunts) en ce qu'il **ne fait pas sortir la marchandise du depot** : il la retient pour un tiers, sur une periode donnee.

**Principe :**
1. Une reservation retient du stock pour un acteur, entre une date de debut et une date de fin.
2. A la creation, la quantite disponible est verifiee article par article ; si la demande depasse le disponible, la creation est refusee.
3. Le blocage suit le **FEFO** : les lots sont pris dans l'ordre de peremption croissante, et le dernier lot preleve peut etre partiel.
4. Chaque part bloquee genere un mouvement de type **RESERVATION** (sens -1) rattache a la reservation : le **stock disponible diminue immediatement**, comme pour une sortie ou un pret. La marchandise reste physiquement dans le depot.
5. Une reservation **active** bloque le stock jusqu'a sa date de fin. Trois issues possibles :
   - **Validation** (`REALISE`) : l'acteur a recupere sa reservation, les articles sortent reellement. Les mouvements de blocage **passent en SORTIE** ; ils restent dates du jour de la creation de la reservation et lui restent rattaches.
   - **Annulation manuelle** (`ANNULE`) : le stock est immediatement rendu, les mouvements de blocage etant annules donc ignores par le calcul de stock.
   - **Expiration** (`EXPIRE`) : au-dela de la date de fin, le stock est rendu automatiquement. Le balayage est idempotent et s'execute au demarrage du serveur puis toutes les heures.
6. Une reservation cloturee n'est plus modifiable. Sa date de cloture, son motif (`VALIDEE`, `MANUEL`, `EXPIRE`) et l'utilisateur qui l'a cloturee sont conserves.
7. Le personne concernee est saisie librement ; si le texte saisi correspond a un compte utilisateur, le lien avec ce compte est conserve.

**Tracabilite (C4) :** creation, validation et annulation sont tracees dans le journal d'audit ; le rattachement au journal des mouvements est assure par la colonne `reservationId`.

---

## 4. REGLES NOUVELLES / MODIFIEES PAR RAPPORT A L'EXCEL

| Regle | Excel actuel | Application V1 |
|---|---|---|
| Journal des mouvements | 2 journaux (E-S et E-S (2)) | 1 journal unique consolide (D1) |
| Stock disponible | Formule SUMIF cassee (#REF!) | Recalcul permanent depuis les mouvements (D2) |
| Consommation mensuelle | Saisie / importee (forme libre) | Calculee depuis les sorties (D3) |
| Proposition d'achat | CONS. PRODUIT / RUBAN ADHESIF | Hors V1 (D4) |
| Localisation | ETABLISSEMENT / EMPLACEMENT melanges | 2 niveaux distincts (D5) |
| Inventaire | Ponctuel, quantites vides | Campagne mensuelle, ecarts traces, pertes (D6, C1) |
| Prix unite | P.U. vide dans VALEUR/VALORISATION | Prix saisi par lot, cout moyen pondere, prix article en repli (D7, D11) |
| Prets / emprunts | Module separe (SITUATION) | Module dedie conserve (D8) |
| Transferts entre depots | Type TRANSFERT non exploite | Mouvement TRANSFERT complet (D10) |
| Categorie article | 3 categories | 4 categories + PIECE DE RECHANGE (C3) |
| Lots | Suivi manuel | Traçabilite primordiale, alerte peremption (C2) |
| Traçabilite | Aucune | Audit complet de toutes les actions (C4) |
| Types mouvement | ENTRÉE / SORTIE (liste libre) | + TRANSFERT, PERTE, AJUSTEMENT (normalises) |

---

## 5. POINTS RESIDUELS - DECISIONS VALIDEES (source : docs\04)

| Ref | Question | Decision validee |
|---|---|---|
| 0.1 | Le PRET / EMPRUNT doit-il impacter le stock disponible ? | **(a) OUI** : le pret sort du stock, la restitution le reintegre |
| 0.2 | Serie de codes pour PIECE DE RECHANGE et EQUIPEMENT | **300xxx = PIECE DE RECHANGE, 400xxx = EQUIPEMENT** |
| 0.3 | Lot obligatoire : quels articles ? | **(b)** uniquement les perissables ou marques "lot-trace" |
| 0.4 | Une SORTIE / PERTE est-elle bloquee si stock par lot insuffisant ? | **(a) BLOQUER** (pas de stock negatif) |
| 0.5 | Regle d'observation : conserver le coefficient x1,05 ? | **(b) CONSERVER le coefficient 1,05** |
| 0.6 | Alerte peremption : delai par defaut | **30 jours** (modifiable en parametre) |
| 0.7 | Code article modifiable par l'admin ? | **(a) NON** : automatique, jamais modifiable |

**Corrections complementaires validees :**
- M6 : RESTITUTION = 2 sous-types (RESTITUTION PRET / RESTITUTION EMPRUNT) rattaches a l'operation d'origine.
- M9 : tableau de bord par lot avec drapeaux : < 6 mois = ROUGE, 6-12 mois = ORANGE, > 1 an = VERT.
- A1/A2 : developpement en **TypeScript** (front + back) avec **Prisma ORM** (modele de donnees = source de verite).
- A3 : authentification login + mot de passe (hache) + JWT, **droits par profil** ADMIN / MAGASINIER / TOP_MANAGEMENT (D16).
- A4 : bons (M8) enregistres tels quels en V1, sans impression conforme ; reconformite en V2.
- A5 : IA Gemini hors V1 (V2).
- A6 : hebergement reseau local uniquement.

---

## 6. RECETTE / CRITERES DE VALIDATION (par module)

Pour chaque module, la validation se fera avec des tests explicites (voir etape Tests) :
- M1 : creer un article avec chacune des 4 categories ; verifier serie de code ; verifier statut.
- M2 : saisir entree / sortie / transfert / perte / ajustement ; verifier sens et impacts stock ; verifier annulation admin.
- M3 : verifier les calculs de stock, seuils, couverture sur jeux de donnees connus.
- M4 : creer des lots ; verifier les 4 vues de peremption ; verifier l'alerte.
- M5 : ouvrir une campagne, saisir des comptages, valider ecarts, generer ajustements/pertes traces.
- M6 : preter, restituer ; verifier les soldes par client ; verifier la synthese.
- M7 : saisir un prix, verifier la valorisation ; modifier le prix et verifier l'historique.
- M8 : saisir un bon ; verifier la REF automatique et l'enregistrement (V1 sans impression conforme).
- M9 : verifier KPIs et liste des alertes.
- M10 : verifier l'audit complet d'une sequence (creation article, mouvement, annulation).
- M11 : verifier que chaque role ne voit que ce qui lui est autorise.
- M12 : modifier un seuil et verifier l'impact sur les calculs (M3).
- M13 : creer une reservation, verifier le blocage FEFO et la baisse du stock disponible ; la valider (les mouvements de blocage deviennent des SORTIE) ou l'annuler (le stock est rendu).