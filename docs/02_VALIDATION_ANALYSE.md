# GD TRADING - VALIDATION DE L'ANALYSE FONCTIONNELLE

**A remplir par le responsable (directeur).**
Date : \_\_/\_\_/2026   |   Valide par : \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

---

## PARTIE A - VALIDATION GLOBALE DE L'ANALYSE

L'analyse du fichier Excel (`docs\01_ANALYSE_FONCTIONNELLE.md`) est-elle correcte et complete ?

- [x] OUI, l'analyse est validee sans correction
- [ ] OUI, avec les corrections ci-dessous

### Corrections / ajouts (indiquer n° de section et correction)

1. \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
2. \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
3. \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
4. \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
5. \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

---

## PARTIE B - REPONSES AUX 10 QUESTIONS (DECISIONS)

### D1 - Quel journal des mouvements fait reference ?
- [ ] (a) `JOURNAL E-S` uniquement (le plus recent)
- [ ] (b) Fusionner `JOURNAL E-S` et `JOURNAL E-S (2)` (consolider tout l'historique)

Reponse : \b\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

### D2 - STOCK DISPONIBLE : calcule ou saisi ?
- [ ] (a) Recalcule automatiquement depuis les mouvements du journal (entrees - sorties)
- [ ] (b) Saisi manuellement

Reponse : \a\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

### D3 - D'ou viennent les consommations mensuelles (Janvier-Decembre) ?
- [ ] (a) Saisie manuelle dans la fiche article
- [ ] (b) Calculees automatiquement depuis les sorties (ventes) du journal
- [ ] (c) Importees depuis un autre outil
- [ ] (d) Autre : \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Reponse : \b\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

### D4 - Modele de reapprovisionnement (proposition d'achat) ?
- [ ] (a) Modele actuel "sur les ventes" : Stock max = 2 x VENTE, Stock securite = VENTE / 2, QTE commande = MAX - DISPO
- [ ] (b) Modele theorique de la feuille BD : Point de commande = Stock securite + (Conso x Delai livraison)
- [ ] (c) Hybride : garder le calcul actuel mais ajouter le delai de livraison

Reponse : n'est pas pris en compte actuelement dans la V1 de l'appliquation mais a integrer dans la version suivante

### D5 - Notion de depot : etablissement seul ou aussi emplacement interne ?
- [ ] (a) Etablissement seul (ALGER, BLIDA 1, BLIDA 2, CONSTANTINE, EXTERIEUR)
- [ ] (b) Les deux (Etablissement + Emplacement interne : DEPOT 1, DEPOT 2, DEPOT 1&2, FERMENT)

Reponse : \b\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

### D6 - Inventaire physique : comment se fait-il en realite ?
- [ ] (a) Inventaire general periodique (1 fois par an)
- [ ] (b) Inventaire tournant (par famille, par depot, tout au long de l'annee)
- [ ] (c) Saisie des quantites comptees directement (la colonne INVENTAIRE etait vide dans le fichier)

Reponse : choisie la repense (a) mais 1 fois par mois non pas par an 

### D7 - Valorisation du stock : quel prix unitaire ?
- [ ] (a) Dernier prix d'achat (P.U. du dernier mouvement d'entree)
- [ ] (b) Cout moyen pondere (coût de revient)
- [ ] (c) Prix saisi manuellement par article
- [ ] (d) Autre : (c) mais modifiable (possibilitee de modification apres saisi)

Reponse : (d) - le prix de valorisation est saisi manuellement et reste modifiable apres
saisie. Cette reponse n'avait pas ete reportee ici ; elle a ete figee dans le registre des
decisions de `docs\03` (D7), a partir de la lecture des feuilles VALEUR / VALORISATION.
D7 est depuis completee par la decision D11 (cf. `docs\03`) : la valorisation est calculee
au cout moyen pondere et le prix est porte par le LOT, le prix de l'article ne servant
que de repli pour les lots qui n'ont pas de prix propre.

### D8 - Prets / emprunts de marchandises : module dedie ?
- [ ] (a) Oui, module dedie (comme SITUATION) avec restitution et solde par client
- [ ] (b) Non, l'application ne gere pas les prets/emprunts en v1

Reponse : \a\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

### D9 - Perimetre de la version 1 (v1) ?
- [ ] (a) Stock uniquement (articles, mouvements, etat, lots/peremptions, proposition d'achat, inventaire, valorisation, prets, bons, tableau de bord)
- [ ] (b) Stock + Personnel (permanence, heures sup, manutention) + Equipement
- [ ] (c) Autre perimetre : \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Reponse : \a\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

### D10 - Transferts entre depots : a gerer ?
- [ ] (a) Oui : mouvement TRANSFERT avec depot source et depot destination (sortie d'un depot, entree dans l'autre)
- [ ] (b) Non, pas pour le moment

Reponse : \a\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

---

## PARTIE C - REGLES COMPLEMENTAIRES DU DIRECTEUR (auteur/informations metier)

1. avoir une trassabilite inventaires et declarer les pertes 
2. la gestion des lot est d'un role primordial dans l'appliquation
3. il exixte une autre categorie de produit a prendre en compte a part (Embalages/Equipements/Matieres premieres) qui est (Piece de rechenge)
4. avoire une tracabilite de qui a ajout/supprime/modifier quoi
## PARTIE D - PERMISSIONS DES ROLES (admin / magasinier)

### Le magasinier peut faire (cocher) :
- [x] Saisir les entrees de stock
- [x] Saisir les sorties de stock
- [x] Consulter l'etat des stocks
- [x] Saisir l'inventaire physique
- [ ] Creer/modifier des articles
- [ ] Autre : \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

### L'admin peut faire (cocher) :
- [x] Tout ce que le magasinier fait
- [x] Valider/annuler un mouvement
- [x] Gerer les utilisateurs et roles
- [x] Modifier les parametres (seuils, familles, depots, acteurs)
- [x] Consulter la valorisation et les rapports
- [ ] Autre : \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_