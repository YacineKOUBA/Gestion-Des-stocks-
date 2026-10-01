# GD TRADING - ANALYSE FONCTIONNELLE DU FICHIER EXCEL

## "GD TRADING - GESTION DES STOCKS (2).xlsx"

**Statut :** Document d'analyse (Etapes 1 et 2 de la methode) - **EN ATTENTE DE VALIDATION**
**Date :** 18/09/2026
**Source analysee :** `C:\Users\Y.DROUICHE\Downloads\GD TRADING-GESTION DES STOCKS (2).xlsx`

---

## 1. VUE D'ENSEMBLE

Le classeur contient **22 feuilles**, regroupables par role :

| Role | Feuilles |
|---|---|
| Referentiels et parametres | `BD`, `PRODUIT` |
| Mouvements de stock | `JOURNAL E-S`, `JOURNAL E-S (2)`, `INVENTAIRE`, `SITUATION`, `PRET-RESTITUTION-EMPRUNT`, `BON` |
| Suivi du personnel et equipement | `PERMANENCE`, `HEURES SUP.`, `MANUTENTION`, `EQUIPEMENT` |
| Etats, rapports et tableaux de bord | `ETAT DES STOCKS`, `ETAT STOCK`, `GESTION LOTS`, `VALEUR`, `VALORISATION`, `CONS. PRODUIT`, `RUBAN ADHESIF`, `TCD`, `Feuil1`, `Feuil2` |

### Referentiels communs (listes deroulantes = plages nommees)

- `ARTICLE` (designations), `FAMILLE` (43 familles), `CATEGORIE` (MATIERE PREMIERE / EMBALLAGE / EQUIPEMENT / PIECE DE RECHANGE)
- `ORIGINE`, `ETABLISSEMENT` (depots), `PARTENAIRE` (786 partenaires)
- `ACHAT` (INTERNATIONAL / LOCAL / MIXTE / NON DEFINI), `STATUT` (ACTIVE / INACTIVE)
- `MESURE` (KG / UNITE / LITRE / ML / PIECE), `PIECE` (LIVRAISON, RECEPTION, INVENTAIRE...)
- `EMPLACEMENT`, `ETAT`, `PERISSABLE`, `PERIODE`, `FREQUENCE`, `SEUIL`, `TYPE`

---

## 2. DETAIL PAR FEUILLE

### 2.1 `BD` - Base de donnees (referentiel des parametres)

**Role :** referentiel central + parametres de calcul des seuils de stock. Aucune operation metier ici, uniquement des listes et parametres.

| Zone | Contenu |
|---|---|
| Col A | `ACHAT` : INTERNATIONAL / LOCAL / MIXTE / NON DEFINI + zone "Formules" |
| Col B | Continents : INTERNATIONAL, AFRIQUE, EUROPE, AMERIQUE-NORD, AMERIQUE-SUD, ASIE, OCEANIE |
| Col C | `ETAT` (PERISSABLE / NON PERISSABLE) + `ETABLISSEMENT` : DEPOT ALGER, DEPOT BLIDA 1, DEPOT BLIDA 2, DEPOT CONSTANTINE, DEPOT EXTERIEUR |
| Col D | `PERISSABLE` : durees de vie validite (24 / 18 / 12 / 6 / 3 / 1) |
| Col E | `STATUT` (ACTIVE / INACTIVE) + `EMPLACEMENT` : DEPOT 1, DEPOT 1&2, DEPOT 2, DEPOT EXTERIEUR, DEPOT FERMENT |
| Col F | `PERIODE` : ANNUELLE, BIMESTRIELLE, DIZAINE, HEBDOMADAIRE, MENSUELLE, QUINZAINE, SEMESTRIELLE, TRIMESTRIELLE |
| Col G | `TYPE` (mouvements) : CONSOMMATION A L'ETAT, CULINAIRE, MIXTE, PIECE, AJUSTEMENT, EMPRUNT, INVENTAIRE, LIVRAISON, PRET, RECEPTION, RESTITUTION/EMPRUNT, RESTITUTION/PRET, RETOUR, SORTIE, TRANSFERT |
| Col G/H | Liste `RUBAN ADHESIF` associee au `CONDITIONNEMENT` (unites par carton) : 1000Y 38µ -> 72, 1000Y 50µ -> 6, 100Y 38µ -> 72, 100Y 40µ -> 72, 100Y 50µ -> 66, 150Y 40µ -> 48, 200Y 40µ -> 48, 300Y 40µ -> 36, 50Y 40µ -> 90, 60Y 40µ -> 90, 80Y 40µ -> 78 |
| Col H | `CATEGORIE` |
| Col I | `FAMILLE` (43 familles : CONSERVATEUR, ALUMINIUM, AMIDON, AROME, ENZYME, EMULSIFIANT, GRAISSE VEGETALE, LEVURE, PARAFFINE, RUBAN ADHESIF, SUCRE...) |
| Col J | `FREQUENCE` en jours (360, 180, 90, 60, 30, 15, 12, 10, 7, 1) |
| L17-L19 / K17-K19 | **Parametres de seuils** (utilises par `PRODUIT`) : K17 = **0,5** (coefficient MAXI), K18 = **21** (MINI, jours), K19 = **9** (SECURITE, jours) |
| Col S | `PARTENAIRE` : **786 partenaires** (clients / fournisseurs / tiers) |

**Formules et notes embarquees (col A36-A40) - regles metier citees dans le fichier :**

- `Delai livraison = Date livraison - Date commande`
- `Stock Securite = (Delai livraison maximum - Delai livraison moyen) x Demande moyenne article`
- `Point de commande = Stock securite + (Consommation moyenne x Delai livraison)`
- `Stock maximum = Point commande + Quantite reapprovisionnement - (Demande minimum x Delai livraison)`

> NOTE : ces formules "theoriques" en colonne A ne sont **pas** celles reellement implementees dans les cellules (voir section 4). **A VALIDER** avec le directeur : lesquelles font reference ?

---

### 2.2 `PRODUIT` - Referentiel des articles (238 articles)

**Role :** fiche article + stock + consommation + seuils de reapprovisionnement.

Colonnes (48) :

- `ITEM` (1..238, = ROW()-1) - *calcule*
- `STATUT` (ACTIVE/INACTIVE) ; `STATUT 2` (vide) - *saisie*
- `CODE ARTICLE` : numerique, fourchette **100001..200180** (100xxx ~ EMBALLAGE, 200xxx ~ MATIERE PREMIERE) - *saisie*
- `DESIGNATION`, `DESIGNATION2` (code E..., ex : E300), `FABRICANT` - *saisie*
- `EMPLOI GD` : PRODUCTION / REVENTE EN L'ETAT / MIXTE (liste deroulante) - *saisie*
- `CATEGORIE`, `FAMILLE`, `APPLICATION`, `U.M.`, `CONDITIONNEMENT`, `SOURCE` (ACHAT), `ORIGINE` - *saisie*
- `STOCK DISPONIBLE` : somme des mouvements du journal - *calcule par formule (cassee #REF! dans ce fichier)*
- `ARRIVAGE` : **encours / commandes en cours** - *saisie*
- `DATE ARRIVAGE` - *saisie*
- `STOCK VIRTUEL` = STOCK DISPONIBLE + ARRIVAGE - *calcule*
- `Janvier..Decembre` : **consommation mensuelle** - *saisie ou importee (aucune formule)*
- `STOCK SECURITE`, `STOCK MIN`, `STOCK ALERTE`, `STOCK MAX` - *calcules (voir section 4)*
- `CONS. THEORIQUE MOIS`, `CONS. (J)`, `C.MAX.MOIS`, `CONS. REELLE MOIS` - *calcules*

---

### 2.3 `JOURNAL E-S` - Journal des entrees/sorties (688 lignes, 01/06/2026 -> 08/09/2026)

**Role :** journal courant des mouvements (source de verite). **182 ENTREES et 506 SORTIES**.

| Colonne | Role |
|---|---|
| DATE | date du mouvement |
| DESIGNATION | article (liste deroulante ARTICLE) |
| CODE ARTICLE, FABRICANT, DESIGNATION2, FAMILLE, CATEGORIE | *remplis par recherche (formules XLOOKUP/VLOOKUP partiellement cassees)* |
| ORIGINE | pays / source |
| ACTEUR | **partenaire** (livreur, client, fournisseur) |
| TYPE | **ENTREE / SORTIE** (+ autres types possibles dans BD) |
| P.U.ACHAT | prix unitaire d'achat |
| QUANTITE | quantite du mouvement |
| SENS | = +QUANTITE si ENTREE, -QUANTITE si SORTIE - *calcule* |
| U.M., U.M.2 | unites |
| LOT, DATE FABRICATION, DATE EXPIRATION | tracabilite lot |
| DEPOT (ETABLISSEMENT) | depot : BLIDA 1 (335), BLIDA 2 (348), EXTERIEUR (5) |
| PIECE | document (LIVRAISON, RECEPTION, INVENTAIRE...) |
| STATUT, OBSERVATION | n° de piece / remarques |

---

### 2.4 `JOURNAL E-S (2)` - Ancien journal (417 lignes, 04/01/2026 -> 04/02/2026)

Structure similaire mais : sans `CODE ARTICLE`, avec `BENEFICIAIRE`, colonnes `ENTREE` et `SORTIE`, `STK MVT` (cumul). **Toutes les lignes du 04/01/2026 ont QUANTITE = 0 et PIECE = "INVENTAIRE"** -> il s'agit d'un **recensement initial** (inventaire de depart des designations).

> **Doublon potentiel :** deux journaux qui se chevauchent conceptuellement. **A VALIDER :** le journal courant est `JOURNAL E-S` ; `JOURNAL E-S (2)` serait-il remplace par `INVENTAIRE` + `JOURNAL E-S` dans la nouvelle application ?

---

### 2.5 `INVENTAIRE` - Saisie d'inventaire physique (268 lignes, 04/01/2026)

`DATE`, `DESIGNATION`, `DESIGNATION2`, `FAMILLE`, `U.M.`, `FABRICANT`, `ORIGINE`, `INVENTAIRE` (quantite physique), `LOT`, `DATE EXPIRATION`, `ETABLISSEMENT`.

> **Colonne `INVENTAIRE` (quantite) vide dans ce fichier** - seule la liste des articles inventories est listee. **A VALIDER :** les quantites reelles sont-elles ailleurs (ex. `ETAT STOCK`) ou non encore saisies ?

---

### 2.6 `ETAT STOCK` - Stock physique par article x depot x lot (398 lignes)

`CATEGORIE`, `FAMILLE`, `DESIGNATION`, `LOT`, `DATE FABRICATION`, `DATE EXPIRATION`, `DEPOT`, `U.M.`, `TOTAL DEPOT`, `TOTAL ARTICLE`.

C'est une **vue** (type pivot) de la realite physique : ex. `AMOI ALUMINIUM LID REEL 49 MM` = 28,24 KG a `DEPOT BLIDA 2`. La majorite des lignes ont un lot vide -> la vue par lot n'est utilisee que lorsque renseignee.

---

### 2.7 `GESTION LOTS` - Suivi des expirations (297 lignes)

4 sections dynamiques (du plus urgent au plus lointain) :

1. **PRODUITS PERIMES AU PLUS TARD < aujourd'hui** (TODAY())
2. **EXPIRATION DANS MOINS DE 6 MOIS** (< TODAY()+180)
3. **EXPIRATION ENTRE 6 MOIS ET MOINS D'UN AN** (< TODAY()+360)
4. **EXPIRATION DANS PLUS D'UN AN** (> TODAY()+360)

Colonnes : `DATE EXPIRATION`, `DESIGNATION`, `FAMILLE`, `LOT`, `DEPOT`, `U.M.`, `TOTAL DEPOT`, `VALEUR`.

---

### 2.8 `ETAT DES STOCKS` - Tableau de bord des stocks par article (117 lignes)

Par article : DESIGNATION, DESIGNATION2, FAMILLE, U.M., CONDITIONNEMENT, EMPLACEMENT, SOURCE, CONS (J), PERIODE, FREQUENCE, **STOCK DISPONIBLE**, COUV. STOCK, DATE STOCK, **ENCOURS**, COUV VIRTUELLE, DATE VIRTUELLE, **STOCK VIRTUEL**, STOCK SECURITE, STOCK MIN., STOCK ALERTE, STOCK MAX., **OBSERVATION**.

> La plupart des formules XLOOKUP pointent vers des colonnes `#REF!` -> valeurs affichees "-". Ce tableau de bord est donc **casse dans la version livree** (a reconstruire dans l'application).

---

### 2.9 `CONS. PRODUIT` - Tableau de bord reapprovisionnement (par produit)

Des tableaux croises dynamiques (filtres : TYPE, DATE [annee], DEPOT) alimentent l'analyse par produit :

- `STOCK DISPONIBLE`, `VENTE` (volume des ventes), `COUVERTURE`, `ECART = DISPO - VENTE`, `% = ECART / VENTE`
- `STOCK SECURITE = ROUND(VENTE / 2, 0)`
- `STOCK MAX = ROUND(VENTE x 2, 0)`
- `QTE A COMMANDER = STOCK MAX - STOCK DISPONIBLE` (si > 0, sinon "-")
- `DECISION` (logique conditionnelle, voir section 4)

**C'est le module "proposition d'achat" de l'entreprise.**

---

### 2.10 `RUBAN ADHESIF` - Tableau de bord dedie a la famille "ruban adhesif"

Meme logique que `CONS. PRODUIT` mais convertie en **cartons** : `STOCK DISPONIBLE / CONDITIONNEMENT` (unites par carton, cf. BD), ventes converties en cartons, stock securite/max arrondis en cartons, QTE A COMMANDER et DECISION selon les cartons.

> Le conditionnement par ruban vient de la table `BD` (G47:H57).

---

### 2.11 `VALEUR` - Valorisation des stocks par lot (106 lignes)

`DESIGNATION`, `LOT`, `U.M.`, `TOTAL LOT`, `P.U.`, `VALEUR = TOTAL LOT x P.U.`, `DATE` (libre).

- Lots renseignes pour les produits traces ; `P.U.` quasi vide (0) -> valorisation **non faite a ce jour**.
- Colonne DATE contient des **annotations** : "Dossier non recu", "Article non identifie", "Stock de nebbache" -> feuille de **travail de regularisation**, pas un etat final.

---

### 2.12 `VALORISATION` - Valorisation des stocks (422 lignes)

`DESIGNATION`, `LOT`, `U.M.`, `TOTAL DEPOT`, `P.U.`, `VALEUR = TOTAL DEPOT x P.U.`.

- 1 ligne par combinaison article x lot x depot. `P.U.` vide -> meme constat que `VALEUR`.

---

### 2.13 `SITUATION` - Suivi des prets / emprunts (11 lignes)

`CLIENT`, `OPERATION` (PRET / EMPRUNT), `DATE`, `PRODUIT`, `QUANTITE P./E.`, `QUANTITE REST.`, `SOLDE = P./E. - REST.`, `U.M.`, `OBSERVATION` (A RESTITUER (ECHANGE), DEPOTAGE...).

Ex. : `EURL KINZ FOOD | PRET | PARRAFFINE ROUGE | 6991 KG | SOLDE 6991`.

---

### 2.14 `PRET-RESTITUTION-EMPRUNT` (22 lignes)

Synthese : somme VOLUME par operation (PRET / EMPRUNT / RESTITUTION) **par unite** (KG, Unite), puis detail des operations (`OPERATION`, `BENEFICIAIRE`, `VOLUME`).

---

### 2.15 `PERMANENCE` - Pointage quotidien du personnel (24 lignes)

`DATE`, `PERSONNEL`, `FONCTION` (CHAUFFEUR & CARISTE, MAGASINIER PRINCIPAL, AGENT POLYVALENT...), `POSITION` (PRESENT/ABSENT), `PONDERATION`, `OBSERVATION`.

- **Regle PONDERATION :** `SI(POSITION <> "PRESENT" ; 0 ; SI(JOURSEM(date;2)=5 [vendredi] ; 2 ; 1))`
- Pivot associe : somme ponderation par personne (ex : A.E.K.DAOUD = 4, A.KHADRAOUI = 2, B.SOUFI = 4, N.FORTAS = 5, total 18).

---

### 2.16 `HEURES SUP.` - Heures supplementaires (19 lignes)

`DATE`, `HEURE DEBUT`, `HEURE FIN`, `ECART = FIN - DEBUT` (duree), `MINUTE`, `POSITION` (A COMPTABILISER / A NE PAS COMPTABILISER), `PRODUIT` (motif : "Arrivage conteneur Cire rouge 20 000 Kg", "Inventaire"...), `PERSONNEL`, `REGLEMENT` (PAYE / NON PAYE).

---

### 2.17 `MANUTENTION` - Operations de manutention / depotage (35 lignes)

`DATE`, `OPERATION` (DEPOTAGE, SPECIALE...), `TYPE CONTENEUR` (20'' / 40''), `NOMBRE CONTENEUR`, `BENEFICIAIRE`, `TYPE MARCHANDISE` (PALETTE / VRAC), `PRODUIT`, `NOMBRE AGENT`, `MONTANT`, `PERSONNEL`, `REGLEMENT`.

> **Une operation = 1 ligne par agent** (ex. une operation a 2 agents -> 2 lignes, MONTANT duplique). **A VALIDER :** conserver ce modele ou structurer "operation + agents + montants par agent" ?

---

### 2.18 `EQUIPEMENT` - Registre des equipements (9 lignes)

`DATE`, `DESIGNATION` (MACHINE A TOURS, EXTINTEUR, TRANSPALETTE, ECRAN LCD, PC...), `PAYS ORIGINE`, `FABRICANT`, `MODELE`, `N° SERIE`, `QUANTITE`, `EMPLACEMENT` (UNITE DE PRODUCTION INOX BLIDA, DEPOT 1 BLIDA...), `PIECE`, `OBSERVATION`.

---

### 2.19 `BON` - Modele de bon (45 lignes)

En-tete **EURL GD TRADING - BON DE SORTIE / DE TRANSFERT / DE LIVRAISON** (liste deroulante), `Depot Source`, `Depot Destination`, `REF`. C'est un **modele imprimable** de bon.

---

### 2.20 `Feuil1` - Fiche d'inventaire (125 lignes)

"Fich D'inventaire", `Date`, liste des depots, tableau : `Designation | Categorie | Lot | Date fabrication | Date d'expiration | DEPOT | Stock theorique | Stock physique | Ecart (+/-) = physique - theorique | Observations`.

> Feuille de **controle d'inventaire** (comparaison stock theorique vs comptage physique).

---

### 2.21 `TCD` - Tableau de bord (pivot / KPIs)

Indicateurs : **127 designations distinctes**, **92 lots distincts**, **somme SENS = 383 497,15** (unites). Utilise GETPIVOTDATA sur un pivot non visible dans ce fichier -> depend d'une source externe.

### 2.22 `Feuil2` - Tableau des lots (pivot, 131 lignes)

Liste produits x LOT x DATE FABRICATION x DATE EXPIRATION (2 tableaux cote a cote).---

## 3. ENTITES METIER IDENTIFIEES

Apres analyse (et non simple copie des feuilles), les entites metier reelles sont :

1. **Article** (referentiel produit + consommations + seuils)
2. **Famille**, **Categorie**, **Unite de mesure**, **Conditionnement**
3. **Mouvement de stock** (journal : entree/sortie, avec article, lot, depot, partenaire, prix)
4. **Stock** (par article, par depot, par lot) - notions : disponible / virtuel / encours
5. **Lot** avec dates de fabrication / expiration
6. **Depot / Etablissement** (ALGER, BLIDA 1, BLIDA 2, CONSTANTINE, EXTERIEUR) + EMPLACEMENT interne (DEPOT 1, DEPOT 2, DEPOT 1&2, FERMENT...)
7. **Partenaires / Tiers** (clients, fournisseurs...)
8. **Inventaire physique** (controle theorique vs physique, ecarts)
9. **Pret / Emprunt / Restitution** (avec solde restant par client)
10. **Bon de sortie/transfert/livraison** (document + depots source/destination)
11. **Personnel** (fonctions, permanence, heures sup, manutention, reglements)
12. **Equipement** (registre)
13. **Parametres de stock** (seuils MAXI/MINI/SECURITE, frequences, validites)
14. **Valorisation** (quantite x prix unitaire)

---

## 4. REGLES DE CALCUL OBSERVEES (formules Excel reelles)

| Regle | Formule (simplifiee) | Ou |
|---|---|---|
| SENS d'un mouvement | `SI(TYPE="Entree" ; +QUANTITE ; -QUANTITE)` | JOURNAL E-S / E-S(2) |
| STOCK DISPONIBLE | `somme SENS des mouvements du journal par DESIGNATION` *(casse #REF! dans ce fichier)* | PRODUIT |
| STOCK VIRTUEL | `STOCK DISPONIBLE + ARRIVAGE` | PRODUIT |
| STOCK SECURITE (jours d'achat) | `(CONS. REELLE MOIS / 30) x BD!K19 (9)` | PRODUIT |
| STOCK MIN | `(CONS. REELLE MOIS / 30) x BD!K18 (21)` | PRODUIT |
| STOCK ALERTE | `STOCK SECURITE + STOCK MIN` | PRODUIT |
| STOCK MAX | `C.MAX.MOIS x (1 + BD!K17 (0,5))` | PRODUIT |
| CONS. (J) | `C.MAX.MOIS / 30` | PRODUIT |
| C.MAX.MOIS | `MAX(consommation mensuelle Jan..Dec)` | PRODUIT |
| CONS. REELLE MOIS | `MOYENNE(consommation mensuelle Jan..Dec)` | PRODUIT |
| COUV. STOCK | `STOCK DISPONIBLE / CONS. (J)` | ETAT DES STOCKS |
| DATE STOCK | `AUJOURDHUI() + (COUV. STOCK x PERIODE / FREQUENCE)` | ETAT DES STOCKS |
| COUV VIRTUELLE | `COUV. STOCK + (ENCOURS / CONS. (J))` | ETAT DES STOCKS |
| STOCK VIRTUEL (etat) | `STOCK DISPONIBLE + ENCOURS` | ETAT DES STOCKS |
| OBSERVATION (etat des stocks) | Classement de STOCK VIRTUEL face aux seuils (secu, min, alerte x 1,05, max) - *casse #REF!* | ETAT DES STOCKS |
| STOCK SECURITE (proposition) | `ROUND(VENTE / 2, 0)` | CONS. PRODUIT |
| STOCK MAX (proposition) | `ROUND(VENTE x 2, 0)` | CONS. PRODUIT |
| QTE A COMMANDER | `STOCK MAX - STOCK DISPONIBLE` si > 0 | CONS. PRODUIT |
| DECISION (proposition) | 1. DISPO=0 et VENTE=0 -> "Aucune vente enregistree !!!"\n2. DISPO<0 et VENTE<0 -> "Erreur"\n3. DISPO < STOCK SECU -> "Sous stock - Commander"\n4. DISPO >= STOCK MAX -> "Surstock"\n5. sinon -> "Stock optimal"\n(*et "Rupture de stock" en cas d'erreur*) | CONS. PRODUIT |
| PONDERATION permanence | `SI(POSITION <> PRESENT ; 0 ; SI(JOURSEM(date;2)=5 ; 2 ; 1))` | PERMANENCE |
| ECART / MINUTE heures sup | `HEURE FIN - HEURE DEBUT` | HEURES SUP. |
| VALEUR (valorisation) | `QUANTITE x P.U.` | VALEUR / VALORISATION |
| ECART inventaire | `Stock physique - Stock theorique` | Feuil1 |
| SOLDE pret/emprunt | `QUANTITE P./E. - QUANTITE REST.` | SITUATION |

### Ecart entre la theorie (BD) et l'implementation

- La BD documente `Point de commande = Stock securite + (Conso x Delai livraison)` et un modele de delais de livraison par continent, **mais aucune feuille n'implemente ces formules** (proposition de commande = CONS. PRODUIT, calculee autrement). **A VALIDER :** le directeur veut-il conserver le modele actuel des propositions d'achat (base sur la vente) ou passer au modele des points de commande ?

---

## 5. RELATIONS ENTRE LES FEUILLES

```
BD (parametres, listes, partenaires, seuils)
   |  fournit les listes deroulantes + seuils (K17/K18/K19)
   v
PRODUIT (referentiel articles + conso + seuils) <-- STOCK DISPONIBLE --
   |  alimente par XLOOKUP/VLOOKUP                              |
   v                                                           |
ETAT DES STOCKS (etat article)                      JOURNAL E-S (mouvements)
   |  alimente par PRODUIT + parametres              | principal ;
   v                                                 JOURNAL E-S (2) = ancien/initial
CONS. PRODUIT / RUBAN ADHESIF (propositions d'achat)
```

- **PRODUIT -> ETAT DES STOCKS** : recupere designations, consommations, seuils.
- **JOURNAL E-S -> PRODUIT** : calcule STOCK DISPONIBLE (formule SUMIF, cassee dans ce fichier).
- **ETAT STOCK / GESTION LOTS / VALORISATION / VALEUR** : vues derives de l'etat physique par depot+lot.
- **SITUATION + PRET-RESTITUTION-EMPRUNT** : module prets/emprunts, independant du journal.
- **BON** : document imprimable associe aux sorties/transferts.
- **PERMANENCE / HEURES SUP. / MANUTENTION / EQUIPEMENT** : suivi personnel et materiel, independants du stock.
- **TCD / Feuil2** : pivots de synthese (KPIs).

---

## 6. DONNEES SAISIES / CALCULEES / IMPORTEES

| Donnee | Nature | Source |
|---|---|---|
| Articles (designation, categorie, famille, um, conditionnement, source, origine, emploi) | Saisie | PRODUIT |
| Consommation mensuelle Jan-Dec | Saisie ou importee (pas de formule) | PRODUIT |
| Code article | Saisie (par serie 100xxx / 200xxx) | PRODUIT / JOURNAL E-S |
| Seuils stock | Calculee (formules cf. section 4) | PRODUIT |
| Mouvements (date, article, type, quantite, acteur, lot, depot, piece) | Saisie | JOURNAL E-S |
| SENS (+/-) | Calculee | JOURNAL E-S |
| Stock disponible | Calculee (somme SENS) | PRODUIT (casse) |
| Inventaire physique | Saisie | INVENTAIRE / Feuil1 |
| Prets / emprunts | Saisie | SITUATION / PRET-RESTITUTION-EMPRUNT |
| Permanence, heures sup, manutention | Saisie | PERMANENCE / HEURES SUP. / MANUTENTION |
| Equipements | Saisie | EQUIPEMENT |
| Partenaires | Saisie (786) | BD |
| Valorisation (P.U.) | Saisie (vide a ce jour) | VALEUR / VALORISATION |

---

## 7. ANOMALIES, DOUBLONS ET AMBIGUITES SIGNALES

1. **Formules cassees #REF!** dans `PRODUIT` (STOCK DISPONIBLE), `ETAT DES STOCKS` (beaucoup de XLOOKUP), `EQUIPEMENT` (liste deroulante). Le fichier livre ne calcule donc pas les stocks dispo au niveau referentiel.
2. **Deux journaux** (`JOURNAL E-S` et `JOURNAL E-S (2)`) : risque de doublons ; le E-S (2) semble etre un recensement initial.
3. **INVENTAIRE sans quantites** : colonne quantite vide (0) pour les 268 lignes.
4. **Consommation mensuelle sans formule** : origine inconnue (saisie ? import ? calcul de ventes ?).
5. **TYPE "ENTREE" en majuscules** alors que les formules testent `"Entree"` - OK en Excel (comparaison insensible a la casse) mais fragile.
6. **STATUT = ACTIVE pour les 238 articles** ; `STATUT 2` vide. L'observation "INACTIVE" de l'ETAT DES STOCKS ne correspond donc pas au referentiel.
7. **EMPLACEMENT vs ETABLISSEMENT** : deux notions proches (EMPLACEMENT : DEPOT 1 / DEPOT 2 / FERMENT... ; ETABLISSEMENT : BLIDA 1 / CONSTANTINE...) - a clarifier.
8. **Seuil "STOCK ALERTE"** : defini comme SECU+MIN dans PRODUIT, mais l'ETAT DES STOCKS compare a `STOCK ALERTE x 1,05` : incoherence entre les deux formules.
9. **Propositions d'achat** : 2 tableaux (CONS. PRODUIT, RUBAN ADHESIF) avec 2 logiques de conversion (unite/carton) ; le modele "point de commande" documente dans BD n'est pas utilise.
10. **MANUTENTION** : 1 ligne par agent, MONTANT duplique.
11. **VALEUR / VALORISATION** : P.U. vide, annotations dans la colonne DATE -> donnes de travail non finalisees.
12. **TCD / Feuil2** : pivots relies a des sources non lisibles dans ce fichier (GETPIVOTDATA).
13. **ARTICLE sans CODE** dans JOURNAL E-S (2) et INVENTAIRE (liaison par designation uniquement) -> risque d'homonymie.

---

## 8. DECISIONS A VALIDER (liste de questions pour le directeur)

Le directeur doit trancher les points suivants avant conception :

| # | Probleme | Options | Consequence |
|---|---|---|---|
| D1 | Quel journal faire referencer ? | (a) JOURNAL E-S uniquement ; (b) fusionner E-S et E-S(2) | Perimetre de l'historique migree |
| D2 | STOCK DISPONIBLE doit-il etre recalcule depuis les mouvements (comme prevu par la formule SUMIF) ou saisi ? | (a) calcule ; (b) saisi | Architecture de la table stock |
| D3 | Origine de la consommation mensuelle (Jan-Dec) | (a) saisie manuelle ; (b) issue des sorties ; (c) import | Regle de calcul des seuils |
| D4 | Modele de reapprovisionnement : garder le modele actuel (base ventes : dispo vs vente, max=2*vente, secu=vente/2) ou passer au modele theorique BD (point de commande) ? | (a) actuel ; (b) theorique BD ; (c) hybride | Cœur du module "proposition d'achat" |
| D5 | Notion depot : utiliser uniquement ETABLISSEMENT (ALGER/BLIDA1/BLIDA2/CONSTANTINE/EXTERIEUR) ou aussi EMPLACEMENT interne (DEPOT 1/2/FERMENT) ? | (a) etablissement seul ; (b) les deux | Structure de la gestion des depots et des mouvements |
| D6 | Inventaire physique : saisir des quantites (colonne vide actuellement) ? Periodique ou permanent ? | (a) inventaire annuel ; (b) inventaire tournant | Module "inventaire" et ecarts |
| D7 | Valorisation : P.U. de quel type (dernier PU achat ? coût moyen ?) | (a) dernier PU achat ; (b) coût moyen pondere ; (c) PU saisi | Calcul de la valeur du stock |
| D8 | Prets/emprunts : conserver ce module separe ? | (a) oui, separe ; (b) integrer au journal | Modelisation des mouvements |
| D9 | Personnel (permanence, heures sup, manutention, equipement) : integrer au perimetre de l'application v1 ? | (a) oui tout ; (b) stock seul en v1 ; (c) stock + RH | Decoupage des sprints |
| D10 | Multi-depots : un mouvement peut-il affecter plusieurs depots (transfert) et l'application doit-elle gerer les transferts entre depots ? | (a) oui transferts ; (b) non | Types de mouvements |

---

## 9. PERIMETRE PROPOSE POUR L'APPLICATION (a valider)

Fonctionnalite principale : **GESTION DE STOCK**, articulee autour de :

1. Referentiel articles (PRODUIT) avec consommations et seuils automatiques.
2. Journal des mouvements (entrees/sorties/ajustements/transferts) avec tracabilite lot et depot.
3. Etat de stock par article, par depot, par lot (ETAT DES STOCKS / ETAT STOCK).
4. Gestion des lots et peremptions (GESTION LOTS).
5. Module proposition d'achat (CONS. PRODUIT / RUBAN ADHESIF).
6. Inventaire physique et ecarts (INVENTAIRE / Feuil1).
7. Prets / emprunts (SITUATION).
8. Bons de sortie imprimables (BON).
9. Valorisation du stock (VALEUR / VALORISATION).
10. Tableau de bord (TCD).
11. Modules annexes personnel / equipement (PERMANENCE, HEURES SUP., MANUTENTION, EQUIPEMENT) - **selon decision D9**.