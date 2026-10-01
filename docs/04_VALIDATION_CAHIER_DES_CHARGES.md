# GD TRADING - VALIDATION DU CAHIER DES CHARGES (V1)

**A remplir par le responsable (directeur).**
Date : \_\_/\_\_/2026   |   Valide par : \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

---

## PARTIE A - VALIDATION GLOBALE DU CAHIER DES CHARGES

Le cahier des charges (`docs\03_CAHIER_DES_CHARGES.md`) est-il correct et complet ?

- [ ] OUI, le cahier des charges est valide sans correction
- [x] OUI, avec les corrections ci-dessous

### Corrections / ajouts (indiquer module et correction)

1. M6 : La RESTITUTION peut etre (RESTITUTION.PRET OU RESTITUTION.EMPREINT)
2. M9 : il est necessaire que l'application montre un tableau de bord par lot comme suite :
- lots perimes dans moins de 6 MOIS --> RED FLAG
- lots perimes dans plus de 6 MOIS et moins d'un an --> ORANGE FLAG
- lots perimes dans plus d'un ans --> GREEN FLAG
3. \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
4. \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

---

## PARTIE B - REPONSES AUX 7 POINTS RESIDUELS

### 0.1 - Le PRET / EMPRUNT doit-il impacter le stock disponible ?
- [ ] (a) Oui : le pret sort du stock (mouvement de stock temporaire), la restitution le reintegre
- [ ] (b) Non : suivi independant du stock (comme la feuille Excel SITUATION)

Reponse : \a\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

### 0.2 - Serie de codes pour les articles PIECE DE RECHANGE ?
Proposition : EMBALLAGE = 100xxx, MATIERE PREMIERE = 200xxx, PIECE DE RECHANGE = **300xxx**, EQUIPEMENT = ?

- [ ] (a) Accepter 300xxx pour PIECE DE RECHANGE
- [ ] (b) Autre proposition : \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Et pour EQUIPEMENT, quelle serie ?
- [x] 400xxx
- [ ] Autre : \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Reponse : \a\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

### 0.3 - Le numero de LOT est-il obligatoire pour quels articles ?
- [ ] (a) Pour tous les articles
- [ ] (b) Uniquement pour les articles perissables ou marques "lot-trace"

Reponse : \b\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

### 0.4 - Une SORTIE / PERTE est-elle bloquee si le stock du lot est insuffisant ?
- [ ] (a) Oui : bloquer la saisie (pas de stock negatif)
- [ ] (b) Non : autoriser avec un avertissement (stock negatif possible)

Reponse : \a\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

### 0.5 - Regle d'observation du stock (alerte) : seuils simples, sans le coefficient 1,05 ?
- [ ] (a) Oui : classement simple face a SECURITE / MIN / ALERTE / MAX (coefficient 1,05 supprime)
- [ ] (b) Non : conserver le coefficient 1,05 comme dans l'Excel

Reponse : \b\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

### 0.6 - Alerte de peremption : delai avant expiration a signaler par defaut ?
- [x] 30 jours
- [ ] 60 jours
- [ ] 90 jours
- [ ] Autre : \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Reponse : \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

### 0.7 - Le CODE ARTICLE est-il modifiable par l'admin ?
- [ ] (a) Non : automatique, jamais modifiable (le code suit l'article jusqu'a sa fin de vie)
- [ ] (b) Oui : automatique mais modifiable par l'admin

Reponse : \a\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

---

## PARTIE C - PERIMETRE V1 : DERNIER CONFIRMATION

Le module "proposition d'achat / reapprovisionnement" (CONS. PRODUIT, RUBAN ADHESIF) est bien **hors V1** et sera developpe en V2 ?

- [x] OUI, hors V1 (en V2)
- [ ] NON, le garder en V1

Reponse : \oui\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Les modules Personnel (permanence, heures sup, manutention) et Equipement sont bien **hors V1** ?

- [x] OUI, hors V1
- [ ] NON, les integrer en V1

Reponse : \oui\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_