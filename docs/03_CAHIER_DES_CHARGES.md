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
| D18 | **Correction de C4 sur les secrets.** Un changement de mot de passe etait INVISIBLE dans le journal d'audit : `userSelect` n'expose jamais `passwordHash`, donc les champs `before`/`after` etaient rigoureusement identiques a ceux d'un simple renommage du libelle. Les routes `/users` journalisent desormais un marqueur explicite — `passwordSet: true` a la creation, `passwordChanged: true` a la modification — present uniquement lorsqu'un secret est reellement pose ou remplace, et l'ecran Journal d'audit l'affiche en badge « Mot de passe modifie » (dans le JSON tronque de la colonne « Details », il passerait inapercu). **Le secret lui-meme n'est toujours nulle part trace** : ni en base, ni dans le journal, ni a l'ecran | correction de C4 |
| D19 | Profil **SALES_ADMIN** ajoute, libelle « **Administration des ventes** ». Cinq ecrans demandes : etat de stock, article, mouvement, lot et peremption, **en lecture seule**, plus l'ecran Reservation **en lecture et en ecriture**. Deux points ont ete arbitres avec le directeur. (a) La formule « en ecriture (consulting) seulement » est **contradictoire** ; c'est la *consultation seule* qui a ete retenue, seul sens coherent — et de fait **l'ecran Etat de stock n'a aucune ecriture** : son stock est recalcule depuis les mouvements, `stock.ts` ne contient que `requirePermission('stock:read')`. (b) Sur Reservation, le directeur a precise **creer et annuler, mais pas valider**. D'ou un droit supplementaire : **`reservation:decide` separe de `reservation:write`**, car la validation transforme les mouvements de blocage en SORTIES et autorise donc une sortie reelle du stock ; elle n'etait pas couverte par la demande « modification ». **Corollaire** : la garde `RequirePermission` ne redirige plus en dur vers `/` mais vers le **premier ecran autorise** du menu, sinon ce profil — le premier a ne pas avoir `dashboard:read` — bouclait sur la page d'accueil, qui exige precisement le droit qu'il n'a pas. `referential:read` lui est accorde : le filtre Categorie, le filtre Depot et le formulaire de reservation en dependent ; il n'a ni `referential:manage` ni `referential:write` | demande directeur |
| D20 | **Refonte du module Reservation (revient sur D12 / M13)** sur instruction du directeur. Quatre regles. (1) **Plafond** : le cumul des reservations `ACTIF` d'un article ne peut depasser **15 %** de sa quantite globale (parametre `RESERVATION_PLAFOND_PCT`), verification au moment d'une demande, du solde du plafond. (2) **FEFO a la creation**, fige dans la table `reservation_allocations` (maille article + lot + depot + emplacement) : la promesse ne bouge plus une fois posee. (3) **Reservation virtuelle / preemptive** : la creation n'ecrit **aucun mouvement** ; le stock libre baisse immediatement, et toute operation qui **retire du stock** (sortie, perte, ajustement negatif, pret, cloture d'inventaire) est refusee si elle mord une promesse. Sur la cellule concernee : `Y` = quantite du lot, `X` = quantite reservee, `Z` = quantite a sortir ; si `X + Z > Y`, l'**overlap = X + Z − Y** doit etre confirme explicitement. (4) **A la validation** : les SORTIES reelles sont ecrites au journal, une **note d'information** signale tout lot ampute avant validation ; le reliquat est consomme puis un **re-FEFO sur le stock actuel** couvre le manque, et la validation est **refusee** si le stock ne suffit plus. Sept arbitrages : (a) plafond = cumul des reservations `ACTIF` ; (b) re-FEFO base sur le stock **libre**, le deja-reserve est ignore ; (c) reconstitution impossible -> **refus** (400), la reservation reste `ACTIF`, aucun mouvement ; (d) l'alerte couvre **toute** operation retirant du stock ; (e) le type de mouvement `RESERVATION` est **supprime** de `MoveTypeCode` ; (f) ecran Etat de stock : colonne **Quantite = stock brut** (inchangee), colonne **« Deja reserve » = le nombre puis son pourcentage entre parentheses, dans la meme colonne**, colonne **« Stock libre » = brut moins reserve**, les deux suivant les filtres et le regroupement de la page ; (g) confirmation d'empietement = **refus serveur + jeton HMAC signe** (TTL 5 min, lie a l'operation et a l'utilisateur), revalidation des quantites et trace d'audit. **Point a documenter** : le pourcentage reserve augmente mecaniquement quand le stock baisse apres une sortie autorisee, alors que la quantite reservee n'a pas bouge (voir M13) | instruction directeur |
| D21 | **Plafond de reservation : cumul par acteur (revient sur D20 point 1)** sur arbitrage du directeur. Trois changements de regle. (a) **Le plafond porte sur le cumul des promesses d'un ACTEUR**, pas sur la reserve globale du produit : pour un acteur et un produit, `somme des quantites remaining de ses allocations ACTIF sur ce produit + quantite demandee <= pct % du stock libre de ce produit`. Deux acteurs concurrents peuvent donc chacun atteindre leur quota, et la reserve globale du produit peut depasser 15 % — c'est la consequence directe du choix, assumee et documentee. (b) **L'interdiction de reserver deux fois le meme produit est levee** : un acteur peut repartir son quota sur plusieurs reservations `ACTIF`, et c'est le **cumul** qui borne. (c) **Base = stock LIBRE** et non stock physique : la base baisse a chaque promesse, donc un acteur qui prend tout son quota d'un coup se ferme ensuite la porte lui-meme (effet voulu, signale au directeur avant validation). **Dispense** : `Partner.plafondExempt`, accordee par la direction generale et appliquee par l'administrateur seul — le droit existant `referential:write` suffit, **aucun droit nouveau**. Elle ne porte que sur la **quantite** : stock libre, FEFO et controle de disponibilite s'appliquent toujours. La dispense est un point de reglage dedie, pas une edition generale de l'acteur : le referentiel n'a pas d'ecran d'edition, et ouvrir une mise a jour complete exposerait le nom et le statut a un droit qui n'en a pas la charge. **Route** `PATCH /referential/partners/:id/plafond-exempt`, **un seul champ accepte**, trace d'audit portant l'avant ET l'apres. **Le pourcentage reste un parametre modifiable en page Parametres**, et devient **valide** : il etait refuse silencieusement par un repli sur 15 % si la valeur n'etait pas un nombre dans ]0, 100] — taper « 15,5 » avec une virgule, naturelle en francais, affichait « Parametres enregistres » sans changer la regle. Le refus porte maintenant son motif, et le champ passe en saisie numerique | arbitrage directeur |
| D22 | **Corrections de revue sur l'invariant de promesse (F3, F4, m3)** — trois defauts de la refonte D20, corriges ensemble, **aucun arbitrage nouveau**. Ils partagent la meme racine : l'invariant « promesse restante = stock restant » doit tenir en toute circonstance, et trois chemins pouvaient le contourner. (a) **F3 — l'annulation d'un mouvement ne repassait par aucun controle.** Le stock d'une cellule est la somme des `quantite x sens` : retirer une **ENTREE** (`sens +1`) fait BAISSER la cellule, alors que retirer une SORTIE la fait monter. `createMovement` et `reactivateMovement` (F1) passent tous deux par `assertNoReservedOverlap`, `cancelMovement` non : une promesse ACTIF pouvait donc etre amputee en silence, sans 409, sans jeton, sans trace — et l'ecran Etat de stock affichait « deja reserve » au-dela de 100 %. Le controle est desormais pose sur **la moitie retirante** — l'ENTREE, et pour un TRANSFERT sa moitie destination, l'inverse exact de la reactivation — avec le meme refus 409, le meme jeton HMAC, la meme formule `X + Z − Y` (ici `Y` est le stock *avant* annulation, `Z` la quantite que l'annulation retire, ce qui donne la meme inequation `X + Z <= Y`), les memes amortissements et la **trace d'audit des amputations consenties**. Le message nomme le geste (« a retirer par cette annulation ») au lieu de pretendre qu'on sort la marchandise. Une annulation qui **rend** du stock reste libre : elle libere la promesse, elle ne la mord pas. (b) **F4 — la validation pouvait ecrire un stock negatif.** `validateReservation` empile ses sorties et ne les ecrit qu'apres la boucle, mais le test de couverture relisait la base a chaque allocation : les sorties deja prevues par les iterations precedentes y etaient **invisibles**. Deux allocations du meme article rechargeaient donc chacune le meme stock de repli intact, passaient chacune le test, et l'on ecrivait deux fois la meme quantite. Le calcul retranche maintenant, cellule par cellule, ce que la meme validation a deja decide de sortir — y compris le reliquat servi sur la cellule promise, qui ne se retrouvait dans aucun stock relu. Un **controle invariant final** refuse en outre, avant toute ecriture, si le total prevu sur une cellule depasse son stock libre ; il ne devrait jamais se declencher, il est le filet de securite du meme genre. (c) **m3 — l'annulation renvoyait le statut perime** : `cancelMovement` relisait `move` *avant* l'`update` et la route serialisait cet instantane, donc `PATCH /movements/:id/cancel` repondait `status: \"ACTIF\"` pour un mouvement qu'on venait d'annuler. La reponse porte desormais la ligne ecrite, avec son statut et sa date d'annulation. **Portee de F4, a dire au directeur** : l'invariant tient par construction (`detectOverlap` refuse toute sortie qui descendrait sous les promesses, `consumeOverlap` preleve exactement l'overlap), donc `libreCellule` valait toujours `restant` et le re-FEFO ne pouvait pas se declencher. F4 n'etait **atteignable que tant qu'une operation pouvait retirer du stock sans amortir les promesses** — c'est-a-dire tant que la faille F3 existait. Les deux corrections sont indissociables : F3 ferme la porte, F4 tient l'invariant si elle se rouvre | corrections de revue, aucun arbitrage nouveau |
| D23 | **Deux corrections issues de la revue D22 : un refus qui manquait, une trace qui ne designait rien.** (a) **Annuler une ENTREE dont la marchandise a ete consommee rendait le stock negatif.** F3 a pose le controle d'empietement sur la moitie retirante, mais une seule question : cette annulation mord-elle une **promesse** ? Non — et alors rien ne l'arretait. Une ENTREE de 300 sur une cellule ensuite descendue a 35 s'annulait sans bruit et laissait −265 : ni l'ecran Etat de stock ni la valorisation ne savent representer un stock negatif, la cellule etait muette et fausse. Le controle est desormais pose dans le meme ordre que `createMovementTx` — **disponibilite d'abord, empietement ensuite** — car les deux questions se repondent sur la meme cellule mais ne sont pas de meme nature. **La disponibilite ne se confirme pas**, et c'est un choix assume : le manque d'une SORTIE est toujours borne par une promesse reelle que l'amputation rend honnete, et l'utilisateur peut en consentir ; ici il n'y a **rien a amputer**, confirmer consignerait un stock negatif. Le refus est donc sans issue, il donne les **deux chiffres** (stock avant, stock obtenu), nomme la cellule et oriente vers les deux seules corrections possibles : **reactiver** le mouvement de consommation s'il est lui-meme errone, ou consigner la consommation en **PERTE / AJUSTEMENT** d'inventaire. La frontiere reste nette : `apres = 0` passe (le zero est un stock valide), seul le negatif est refuse. Une annulation qui rend du stock reste hors de ce controle. (b) **m1 — la trace d'empietement confirme designait l'article, pas la partie amputee.** `assertNoReservedOverlap` ecrivait `entity = 'reservation_allocation'` avec `entity_id = <articleId>` : le Journal d'audit affichait « reservation_allocation / 211 », une ligne de `reservation_allocations` annoncee par l'identifiant d'un article, qui n'existe pas. Le detail joint ne corrigeait rien — la faute etait dans la colonne, pas dans le texte. Comme **une cellule porte les promesses de plusieurs reservations**, une confirmation peut amputer plusieurs parties a la fois, et une seule ligne ne pouvait pas les nommer : il y a désormais **une trace par partie reellement prelevee**, `entity_id` = l'`allocationId` vrai, chacune portant le contexte complet du conflit (`Y`, `X`, `Z`, overlap, formule, operation, `geste`) plus **sa part** (`quantitePrelevee`, `reservationId`, `reservationRef`). Le journal se lit alors comme la liste de ce qui a ete reduit, et non comme un rappel du contexte. Un refus, meme 409, ne trace rien : il n'a rien change. Les traces restent conservees apres suppression de la reservation (D14) — elles designent alors des allocations qui n'existent plus, ce qui est le but. |
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

**Reservations (D20).** En plus de la quantite, l'ecran affiche ce qui est **deja reserve** par les reservations `ACTIF` recalculé depuis la table `reservation_allocations`. Trois colonnes :
1. **Quantite** : le **stock brut** (inchange par rapport a l'Excel), c'est-a-dire la quantite physique calculee depuis les mouvements.
2. **Deja reserve** : la quantite promise, **puis son pourcentage entre parentheses dans la meme colonne** (par exemple `50 (4,9 %)`). Le pourcentage est `reserve / stock brut`. Aucun affichage n'est force a zero : la cellule reste `—` tant qu'aucune reservation n'existe.
3. **Stock libre** : `stock brut − deja reserve`, la seule quantite reellement mobilisable (base du FEFO de M13).

Le **pourcentage reserve est un indicateur de tension, pas une regle** : apres une sortie autorisee, le stock brut baisse alors que la quantite reservee n'a pas bouge, donc le pourcentage monte mecaniquement (voir M13).

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
- **Les secrets ne sont jamais journalises, mais leur modification est toujours tracee.** Le champ « Avant / Apres » est produit a partir d'une selection de champs qui n'expose jamais `passwordHash` : sans aménagement, un changement de mot de passe laisserait une trace rigoureusement identique a un simple renommage du libelle, et l'exigence C4 serait silencieusement rompue sur le seul operation la plus sensible. Les routes `/users` journalisent donc un **marqueur explicite** — `passwordSet: true` a la creation, `passwordChanged: true` a la modification — uniquement lorsqu'un secret est reellement pose ou remplace. Le mot de passe et son hash ne figurent ni dans la base, ni dans le journal, ni dans l'ecran. L'ecran Journal d'audit affiche ce marqueur sous forme de badge « Mot de passe modifie », car il passerait inapercu dans le JSON tronque de la colonne « Details » ;
- **Aucune purge automatique ni manuelle en V1** (decision D14) : le journal est conserve integralement. Il n'est jamais nettoye par tranche d'identifiant, une purge devant etre ciblee (action, periode, motif) et tracee. Le filtre par action de l'ecran Journal suffit a naviguer dans le bruit.

---

### M11 - UTILISATEURS ET ROLES (P1, P2, D16, D17, D19)

Quatre profils. `ADMIN` et `MAGASINIER` viennent de P1/P2 ; `TOP_MANAGEMENT` a ete ajoute en **D16** sur demande du directeur general, les droits du `MAGASINIER` ont ete retranches en **D17**, et `SALES_ADMIN` a ete ajoute en **D19**.

| Fonction | MAGASINIER | ADMIN | TOP_MANAGEMENT | SALES_ADMIN |
|---|---|---|---|---|
| Consulter le tableau de bord | OUI | OUI | OUI (lecture) | **NON (D19)** |
| Consulter l'etat des stocks | OUI | OUI | OUI | OUI (D19) |
| Consulter les articles | OUI | OUI | OUI | OUI (D19) |
| Creer / modifier des articles | NON | OUI | NON | **NON (D19)** |
| Saisir entrees et sorties de stock | OUI | OUI | NON | **NON (D19)** |
| Annuler / reactiver / supprimer un mouvement | NON | OUI | NON | **NON (D19)** |
| Gerer les lots et les peremptions | OUI | OUI | CONSULTATION | CONSULTATION (D19) |
| Consulter un inventaire | OUI | OUI | OUI | **NON (D19)** |
| Saisir le comptage de l'inventaire physique | OUI | OUI | NON | NON |
| Ouvrir / decider une campagne d'inventaire | NON | OUI | NON | NON |
| Gerer les prets / emprunts | **NON (D17)** | OUI | CONSULTATION (D16) | **NON (D19)** |
| Gerer les reservations de stock | **NON (D17)** | OUI | CONSULTATION (D16) | creer + annuler, **sans valider** (D19) |
| Gerer les bons (ecran Document) | OUI | OUI | NON (D16) | **NON (D19)** |
| Consulter la valorisation | NON | OUI | OUI (D16) | **NON (D19)** |
| Gerer les utilisateurs et roles | NON | OUI | NON (D16) | **NON (D19)** |
| Gerer l'ecran Referentiel | NON | OUI | NON (D16) | **NON (D19)** |
| Modifier les parametres | NON | OUI | NON (D16) | **NON (D19)** |
| Consulter le journal d'audit | NON | OUI | NON (D16) | **NON (D19)** |

**Droits servis par l'API :** **29** pour `ADMIN`, **12** pour `MAGASINIER`, **9** pour `TOP_MANAGEMENT`, **7** pour `SALES_ADMIN`.

**Mise en oeuvre (D16/D17/D19).** Les droits sont definis en un seul endroit, `server/src/auth/permissions.ts` (matrice `ROLE_PERMISSIONS`, 29 permissions), et appliques par le middleware `requirePermission`, qui remplace l'ancien `requireRole`. Le serveur les renvoie dans `permissions[]` sur `/auth/login` et `/auth/me` : **le client ne recalcule aucun droit**, il consomme la reponse et pose une garde `RequirePermission` par ecran. La granularite est volontairement fine, pour reproduire a l'identique les droits reels : `movement:write` (saisie) est distinct de `movement:revise` (annuler / reactiver / supprimer) ; `inventory:count`, `inventory:write` et `inventory:decide` sont distincts ; `reservation:write` (creer, annuler) est distinct de **`reservation:decide` (valider, D19)**.

**Trois droits de referentiel, trois intentions.** `referential:read` = lire les listes de reference ; `referential:manage` = acceder a l'ecran Referentiel ; `referential:write` = creer / supprimer une reference. `MAGASINIER` et `SALES_ADMIN` possedent `referential:read` **sans** `referential:manage` : leurs formulaires ont besoin de lire les depots, emplacements et acteurs, mais l'ecran Referentiel reste absent de leur menu.

**Une ecriture de reservation, deux intentions (D19).** `reservation:write` couvre la creation et l'annulation, qui rend le stock. `reservation:decide` couvre la seule validation, qui transforme les mouvements de blocage en **SORTIES** : elle autorise une sortie physique du stock et n'a donc pas ete assimilee a une gestion de reservation. Le module Reservation ne comporte aucune operation de modification (ni `PUT` ni `PATCH`) : creer, valider et annuler sont ses trois seules ecritures.

**Redirection vers le premier ecran autorise (D19).** `RequirePermission` ne renvoie plus en dur vers `/`. Il redirige vers le **premier ecran du menu que le profil a le droit d'ouvrir** (`firstAllowedPath`), et affiche un ecran « Acces refuse » si le profil n'a droit a rien. Sans cela, un profil sans `dashboard:read` boucle : la page d'accueil exige le droit qui lui manque. `LoginPage` va directement a cet ecran apres connexion, sans passer par la garde.

**Authentification :** login + mot de passe hache (jamais en clair), sessions ; acces depuis le reseau local uniquement.

Comptes de demonstration : `admin` / `admin2026`, `magasinier` / `magasinier2026`, `direction` / `direction2026` (profil `TOP_MANAGEMENT`), `ventes` / `ventes2026` (profil `SALES_ADMIN`).

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

**Principe (refonte D20) :**
1. Une reservation retient du stock pour un acteur, entre une date de debut et une date de fin.
2. **Plafond cumule par acteur de 15 % (D21, remplace D20-1).** Pour un **acteur** et un produit : `cumul des promesses ACTIF de cet acteur sur ce produit + quantite demandee <= 15 % du stock libre de ce produit` (parametre `RESERVATION_PLAFOND_PCT`, modifiable en page Parametres). Le plafond est donc **propre a chaque acteur** : deux acteurs concurrents peuvent chacun atteindre leur quota, et la reserve globale du produit peut depasser 15 %. Consequence assumee : la base etant le **stock libre**, elle baisse a chaque promesse — un acteur qui prend tout son quota d'un coup se ferme ensuite la porte lui-meme. L'**interdiction de reserver deux fois le meme produit est levee** : c'est le cumul, et non le produit, qui borne. Un acteur **exempte** par la direction generale (`plafondExempt`, pose par l'administrateur seul, trace dans le journal) n'est pas soumis a ce plafond ; il reste soumis au stock libre et au FEFO. Une demande qui depasse est refusee en 400, avec un message nommant l'acteur, le stock libre, son cumul, la demande et le plafond. Le formulaire recharge l'apercu a chaque changement d'acteur et plafonne la saisie sur le **reste** (`plafond − cumul de cet acteur`).
3. **Le parametre est valide.** `plafondPct` se rabat silencieusement sur 15 % si la valeur n'est pas un nombre dans ]0, 100] : taper « 15,5 » avec une virgule enregistrait le parametre sans changer la regle. Le refus est desormais **explicite et motive**, et le champ de saisie est numerique.
4. **FEFO fige a la creation (D20-2).** Les lots sont choisis dans l'ordre de peremption croissante, puis ecrits dans `reservation_allocations` (maille **article + lot + depot + emplacement**). Cette promesse **ne bouge plus** : elle est la reference a laquelle toute operation ulterieure est confrontee.
5. **Reservation virtuelle / preemptive (D20-3).** La creation **n'ecrit aucun mouvement** : le stock physique reste intact, le **stock libre** (brut moins promesses) diminue immediatement, et l'etat de stock l'affiche.
6. **Alerte d'empietement.** Toute operation qui **retire du stock** — sortie, perte, ajustement negatif, pret, cloture d'inventaire — est analysee cellule par cellule :
   - `Y` = quantite totale du lot (stock brut de la cellule) ;
   - `X` = quantite deja reservee sur cette cellule (promesses `ACTIF`) ;
   - `Z` = quantite retiree par l'operation.
   Si `X + Z <= Y`, le stock restant couvre la promesse : rien a signaler. Si `X + Z > Y`, l'operation mord la promesse ; le serveur **refuse l'ecriture** (HTTP 409) et renvoie l'**overlap `= X + Z − Y`**. L'utilisateur confirme explicitement ; l'accord est materialise par un **jeton HMAC signe** (TTL 5 min, lie a l'operation et a l'utilisateur) que le client renvoie avec **la meme** operation. Le serveur revalide alors les quantites : le prelevement confirme est exactement l'overlap, et la promesse est amputee d'autant (regle « promesse restante = stock restant »).
   L'annulation d'un mouvement y est soumise comme les deux autres (**F3**, D22). Comme le stock d'une cellule est la somme des `quantite x sens`, c'est l'**ENTREE** (`sens +1`) qui, une fois annulee, fait **baisser** la cellule ; pour un TRANSFERT, sa moitie destination. `Y` est alors le stock *avant* annulation et `Z` la quantite que l'annulation retire, ce qui donne la meme inequation `X + Z <= Y`. Une annulation qui rend du stock (annuler une SORTIE) ne peut pas mordre une promesse : elle la libere.
   Une **autre** question se pose sur cette meme annulation, d'une autre nature : la marchandise **entree** est-elle encore la ? Si l'annulation laisse la cellule sous zero, elle est refusee en 400 — **sans confirmation possible** (**D23-a**). Ce controle ne porte pas sur la promesse mais sur l'existence meme du stock, il ne s'ampute donc pas : il est pose **avant** l'empietement, comme dans `createMovementTx`, et son refus donne les deux chiffres et oriente vers la reactivation ou la PERTE.
7. **A la validation (D20-4).** Trois temps :
   - les **SORTIES reelles** sont ecrites au journal des mouvements (la promesse devient un fait) ;
   - si un lot a ete ampute avant validation, une **note d'information** le signale (lot et quantite) ; l'overlap a deja ete confirme et trace ;
   - le **reliquat** de la promesse est consomme sur les lots d'origine, puis un **re-FEFO sur le stock actuel** (stock **libre**, le deja-reserve etant ignore) couvre le **manque**. Les sorties d'une meme validation ne sont ecrites qu'a la fin ; le calcul retranche donc, cellule par cellule, ce qu'elle a deja decide de sortir, sans quoi deux allocations du meme article repartiraient deux fois sur le meme stock (**F4**). Un controle invariant final refuse en outre, avant toute ecriture, si le total prevu sur une cellule depasse son stock libre. Si le stock ne suffit plus, la validation est **refusee** (400) et la reservation **reste `ACTIF`** : aucun mouvement n'est ecrit.
8. Une reservation **active** bloque le stock jusqu'a sa date de fin. Trois issues :
   - **Validation** (`REALISE`) : voir le point 7. Droit `reservation:decide`, distinct de `reservation:write` (D19) : la validation autorise une sortie physique du stock.
   - **Annulation manuelle** (`ANNULE`) : la promesse est levee, le stock libre est immediatement rendu. Aucun mouvement a annuler, puisqu'il n'en existe aucun. Droit `reservation:write`.
   - **Expiration** (`EXPIRE`) : au-dela de la date de fin, la promesse est levee automatiquement. Le balayage est idempotent, execute au demarrage du serveur puis toutes les heures.
9. Une reservation cloturee n'est plus modifiable. Sa date de cloture, son motif (`VALIDEE`, `MANUEL`, `EXPIRE`) et l'utilisateur qui l'a cloturee sont conserves.
10. Le personnel concerne est saisi librement ; si le texte saisi correspond a un compte utilisateur, le lien avec ce compte est conserve.

**Effet mecanique du pourcentage reserve (D20, inchange sous D21).** Le pourcentage affiche est `reserve / stock brut`. Une **sortie autorisee** (confirmee) fait baisser le stock brut alors que la quantite reservee n'a pas bouge : le pourcentage **monte donc mecaniquement**, sans qu'aucune nouvelle reservation n'ait ete posee, et peut depasser les 15 % alors que le plafond de chaque acteur est respecte. Ce n'est pas une anomalie : le plafond se verifie au **moment** d'une demande, sur le stock de ce moment, et D21 l'a deplace de la reserve globale vers le cumul d'un acteur. Le pourcentage n'est qu'un **indicateur de tension**, jamais une regle de blocage.

**Suppression du type `RESERVATION` (D20-5).** Le blocage ne s'appuyant plus sur des mouvements, la valeur `RESERVATION` a ete retiree de l'enumeration `MoveTypeCode` (six valeurs : `ENTREE`, `SORTIE`, `TRANSFERT`, `PERTE`, `AJUSTEMENT`, `RETOUR`).

**Tracabilite (C4) :** creation, validation, annulation et **confirmation d'empietement** sont tracees dans le journal d'audit. La confirmation enregistre `Y` (stock du lot), `X` (reserve), `Z` (a sortir), l'`overlap` et la formule `X + Z − Y`. Une confirmation pouvant amputer **plusieurs parties a la fois** — une cellule porte les promesses de plusieurs reservations — elle ecrit **une trace par partie reellement prelevee** (`D23-b`, `m1`), chacune designee par le **`reservation_allocations.id` qui la concerne** : l'entite annoncee est enfin designee par son propre identifiant, la colonne `entity_id` ne portant plus l'`articleId`, qui ne designait aucune ligne. Chaque trace se lit isolement — contexte complet du conflit plus **sa** part (`quantitePrelevee`, `reservationRef`). Un refus, meme 409, ne trace rien : il n'a rien change. L'annulation d'un mouvement qui amortit une promesse (**F3**) joint a sa propre trace les **amputations consenties**, comme la creation et la reactivation. Le rattachement des SORTIES issues d'une validation au journal des mouvements est assure par la colonne `reservationId`. Conformement a **D14**, ces traces ne sont jamais purgees : apres suppression de la reservation, elles designent des allocations qui n'existent plus, ce qui est voulu.

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
- M2 : saisir entree / sortie / transfert / perte / ajustement ; verifier sens et impacts stock ; verifier annulation admin ; **annuler une ENTREE dont la cellule porte une promesse ACTIF et verifier le 409 avec `X + Z − Y` (F3)** — meme dialogue, meme jeton, memes amortissements — puis que la reponse porte le statut `ANNULE` et sa date d'annulation (m3) ; verifier qu'annuler une SORTIE reste libre et sans dialogue ; **annuler une ENTREE dont la marchandise a ete consommee et verifier le refus 400, sans confirmation possible, avec les deux chiffres et l'orientation vers la reactivation ou la PERTE (D23-a)**, qu'un jeton ne contourne pas ce refus, que le zero est accepte et qu'aucune cellule ne finit negative.
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
- M13 : creer une reservation, verifier le FEFO fige et la baisse du **stock libre** sans mouvement ; verifier le **plafond par acteur** (D21) : un acteur est refuse au-dela de son cumul, un second acteur atteint son propre quota sur le meme produit, un acteur **exempte** le depasse, et le refus nomme l'acteur et son cumul ; verifier que deux reservations `ACTIF` du meme acteur sur le meme produit sont acceptees tant que le cumul tient ; modifier le pourcentage en page Parametres et verifier qu'il s'applique immediatement, qu'un pourcentage hors bornes ou avec une virgule est refuse avec son motif, puis le reposer ; cocher la dispense d'un acteur et verifier qu'elle est tracee et reservee a l'administrateur ; provoquer une operation retirant du stock (sortie / perte / pret / cloture d'inventaire) qui mord la promesse et verifier le 409 avec `X + Z − Y` puis la confirmation par jeton ; valider (SORTIES reelles, note d'information si lot ampute, re-FEFO sur le stock libre) ou annuler (stock libre rendu). Verifier l'effet mecanique du pourcentage reserve apres une sortie autorisee. **F4** : la validation ne doit jamais ecrire plus que le stock libre d'une cellule — verifier en A/B sur le meme scenario que l'ancien calcul ecrivait un stock negatif et que le nouveau refuse en 400 sans rien ecrire (le declencheur n'est plus accessible depuis l'application depuis F3 ; la preuve se fait par injection de panne, cf. recette `test-f4-injection.mjs` modes `avant` / `apres`). **m1** : confirmer un empietement qui ampute **deux** reservations et verifier que le journal contient **deux** traces `reservation_allocation`, dont chaque `entity_id` existe dans `reservation_allocations`, correspond a une reservation differente et **n'est pas l'`articleId`** ; verifier qu'aucune trace n'est ecrite avant l'accord, ni sur un refus.