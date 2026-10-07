# GD TRADING - MODELE DE DONNEES POSTGRESQL (ETAPE 7)

**Statut :** EN ATTENTE DE VALIDATION
**Date :** 18/09/2026
**Base :** `docs\03_CAHIER_DES_CHARGES.md` (valide) + `docs\05_ARCHITECTURE.md`

---

## 1. LISTE DES TABLES (29)

| Table | Description | Module |
|---|---|---|
| users | Utilisateurs (login, mot de passe hache, role) | M11 |
| roles | ADMIN / MAGASINIER (+ droits) | M11 |
| categories | EMBALLAGE / MATIERE PREMIERE / EQUIPEMENT / PIECE DE RECHANGE | M1 |
| families | Familles d'articles | M1 |
| units | Unites de mesure (KG, UNITE, LITRE, ML, PIECE...) | M1 |
| packaging | Conditionnements (CARTON, BOBINE, SACHET...) | M1 |
| origins | Origines (pays / continents) | M1 |
| partners | Fournisseurs, clients, entites | M1/M6 |
| depots | Etablissements (ALGER, BLIDA 1, BLIDA 2, CONSTANTINE, EXTERIEUR) | M3 |
| locations | Emplacements internes (DEPOT 1, DEPOT 2, DEPOT 1&2, EXTERIEUR, FERMENT) | M3 |
| articles | Fiches articles (designation, code, categorie, famille, prix...) | M1 |
| article_consumption | Consommation mensuelle calculee (par article, mois) | M3 |
| article_orders | Arrivages / commandes en cours (ENCOURS) | M3 |
| movements | Journal des mouvements (entree, sortie, transfert, perte, ajustement) | M2 |
| lots | Lots par article (numero de lot, dates fab/exp) | M4 |
| inventories | Campagnes d'inventaire | M5 |
| inventory_lines | Lignes de comptage (theorique / physique / ecart / statut) | M5 |
| loans | Operations pret / emprunt | M6 |
| loan_restitutions | Restitutions (PRET, EMPRUNT) liees a une operation | M6 |
| price_history | Historique des prix unitaires par article | M7 |
| bons | Bons de sortie / transfert / livraison | M8 |
| bon_lines | Lignes de bon | M8 |
| settings | Parametres (seuils 9/21/0,5 / 1,05 / alerte 30j...) | M12 |
| audit_log | Journal d'audit (qui a fait quoi) | M10 |
| code_series | Series de codes par categorie (100xxx, 200xxx, 300xxx, 400xxx) | M1 |
| movement_types | Types normalises (ENTREE, SORTIE, TRANSFERT, PERTE, AJUSTEMENT) | M2 |
| article_lot_flag | Indicateur article "lot-trace" (perissable ou non) | M4 |
| notification_alert | Alertes gerees (sous-stock, peremption, inventaire en retard) | M9 |

---

## 2. SCHEMA DETAILLE (DDL simplifie)

> Note : ceci est une vue simplifiee du modele. Le script executable (server/db/schema.sql) ordonnera les CREATE TABLE selon les dependances (ex. `inventories` cree avant `movements`, contraintes FK ajoutees par ALTER TABLE apres creation de toutes les tables).

### 2.1 Utilisateurs et roles

```sql
CREATE TABLE roles (
    id          SERIAL PRIMARY KEY,
    code        VARCHAR(20) UNIQUE NOT NULL,   -- 'ADMIN' | 'MAGASINIER'
    label       VARCHAR(50) NOT NULL
);

CREATE TABLE users (
    id              SERIAL PRIMARY KEY,
    role_id         INTEGER NOT NULL REFERENCES roles(id),
    login           VARCHAR(50) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,     -- bcrypt
    display_name    VARCHAR(100),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_by      INTEGER REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 2.2 Referentiels

```sql
CREATE TABLE categories (
    id    SERIAL PRIMARY KEY,
    code  VARCHAR(20) UNIQUE NOT NULL,   -- EMBALLAGE / MATIERE_PREMIERE / EQUIPEMENT / PIECE_DE_RECHANGE
    label VARCHAR(50) NOT NULL,
    sort  INTEGER
);

CREATE TABLE code_series (
    id            SERIAL PRIMARY KEY,
    category_id   INTEGER UNIQUE NOT NULL REFERENCES categories(id),
    prefix        VARCHAR(6) NOT NULL,    -- '100', '200', '300', '400'
    next_value    INTEGER NOT NULL DEFAULT 1,  -- prochain n° disponible
    digits        INTEGER NOT NULL DEFAULT 6
);

CREATE TABLE families  (id SERIAL PRIMARY KEY, code VARCHAR(20) UNIQUE NOT NULL, label VARCHAR(100) NOT NULL, is_active BOOLEAN DEFAULT TRUE);
CREATE TABLE units     (id SERIAL PRIMARY KEY, code VARCHAR(10) UNIQUE NOT NULL, label VARCHAR(30) NOT NULL);
CREATE TABLE packaging (id SERIAL PRIMARY KEY, label VARCHAR(50) UNIQUE NOT NULL);

CREATE TABLE origins (
    id     SERIAL PRIMARY KEY,
    code   VARCHAR(5) UNIQUE NOT NULL,   -- ex. FRA, ESP, MAR...
    label  VARCHAR(60) NOT NULL,
    region VARCHAR(60)                   -- continent / zone
);

CREATE TABLE partners (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(150) NOT NULL,
    type        VARCHAR(10) NOT NULL,    -- 'FOURNISSEUR' | 'CLIENT' | 'ENTITE' | 'AUTRE'
    is_active   BOOLEAN DEFAULT TRUE
);

CREATE TABLE depots (
    id       SERIAL PRIMARY KEY,
    code     VARCHAR(20) UNIQUE NOT NULL,  -- ALGER, BLIDA1, BLIDA2...
    label    VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE locations (
    id       SERIAL PRIMARY KEY,
    code     VARCHAR(20) UNIQUE NOT NULL,  -- DEPOT1, DEPOT2, DEPOT12, EXTERIEUR, FERMENT
    label    VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);
```

### 2.3 Articles

```sql
CREATE TABLE articles (
    id            SERIAL PRIMARY KEY,
    code          VARCHAR(10) UNIQUE NOT NULL,       -- 100001...
    designation   VARCHAR(200) NOT NULL,             -- nom de reference
    designation2  VARCHAR(200),                      -- code additif E300...
    fabricant     VARCHAR(100),
    emploi_gd     VARCHAR(20) NOT NULL DEFAULT 'PRODUCTION',  -- PRODUCTION / REVENTE_EN_LETAT / MIXTE
    category_id   INTEGER NOT NULL REFERENCES categories(id),
    family_id     INTEGER REFERENCES families(id),
    application   VARCHAR(150),                      -- BOISSONS-CONFITURE-COSMETIQUE-PHARMA
    unit_id       INTEGER NOT NULL REFERENCES units(id),
    packaging_id  INTEGER REFERENCES packaging(id),
    source_achat  VARCHAR(20),                       -- INTERNATIONAL / LOCAL / MIXTE / NON_DEFINI
    origin_id     INTEGER REFERENCES origins(id),
    periode       VARCHAR(20),                       -- ANNUELLE(360), BIMESTRIELLE(180)...
    frequence     INTEGER,                           -- jours (360, 180, 90, 30...)
    statut        VARCHAR(10) NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE / INACTIVE
    unit_price    NUMERIC(14,4),                     -- prix saisi manuellement (D7)
    is_lot_tracked BOOLEAN NOT NULL DEFAULT FALSE,   -- article "lot-trace" / perissable (0.3)
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_articles_family ON articles(family_id);
CREATE INDEX idx_articles_category ON articles(category_id);

CREATE TABLE article_consumption (
    id          SERIAL PRIMARY KEY,
    article_id  INTEGER NOT NULL REFERENCES articles(id),
    year        INTEGER NOT NULL,
    month       INTEGER NOT NULL,      -- 1..12
    quantity    NUMERIC(14,3) NOT NULL DEFAULT 0,
    UNIQUE(article_id, year, month)    -- une ligne par article et par mois
);

CREATE TABLE article_orders (
    id              SERIAL PRIMARY KEY,
    article_id      INTEGER NOT NULL REFERENCES articles(id),
    quantity        NUMERIC(14,3) NOT NULL,
    expected_date   DATE NOT NULL,     -- date d'arrivee prevue
    supplier_id     INTEGER REFERENCES partners(id),
    arrived         BOOLEAN NOT NULL DEFAULT FALSE,
    created_by      INTEGER REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE price_history (
    id           SERIAL PRIMARY KEY,
    article_id   INTEGER NOT NULL REFERENCES articles(id),
    unit_price   NUMERIC(14,4) NOT NULL,
    changed_by   INTEGER REFERENCES users(id),
    changed_at   TIMESTAMPTZ DEFAULT now()
);
```

### 2.4 Mouvements et lots

```sql
CREATE TABLE movement_types (
    id     SERIAL PRIMARY KEY,
    code   VARCHAR(15) UNIQUE NOT NULL,  -- ENTREE / SORTIE / TRANSFERT / PERTE / AJUSTEMENT
    label  VARCHAR(30) NOT NULL,
    sens   SMALLINT NOT NULL             -- +1 / -1
);

CREATE TABLE lots (
    id            SERIAL PRIMARY KEY,
    article_id    INTEGER NOT NULL REFERENCES articles(id),
    lot_number    VARCHAR(50) NOT NULL,
    fabric_date   DATE,
    expiry_date   DATE,
    UNIQUE(article_id, lot_number)
);
CREATE INDEX idx_lots_expiry ON lots(expiry_date);

CREATE TABLE movements (
    id                  BIGSERIAL PRIMARY KEY,
    type_id             INTEGER NOT NULL REFERENCES movement_types(id),
    article_id          INTEGER NOT NULL REFERENCES articles(id),
    lot_id              INTEGER REFERENCES lots(id),
    quantity            NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
    sens                SMALLINT NOT NULL CHECK (sens IN (-1, 1)),
    depot_id            INTEGER NOT NULL REFERENCES depots(id),
    location_id         INTEGER REFERENCES locations(id),
    depot_dest_id       INTEGER REFERENCES depots(id),      -- TRANSFERT
    location_dest_id    INTEGER REFERENCES locations(id),   -- TRANSFERT
    partner_id          INTEGER REFERENCES partners(id),
    doc_number          VARCHAR(50),                         -- livraison / facture / bon
    unit_price          NUMERIC(14,4),
    movement_date       DATE NOT NULL,
    observation         VARCHAR(255),
    link_movement_id    BIGINT REFERENCES movements(id),     -- lien sortie<->entree d'un transfert
    remediation         VARCHAR(20),                         -- 'INVENTAIRE' si origine inventaire
    inventory_id        INTEGER REFERENCES inventories(id),
    status              VARCHAR(15) NOT NULL DEFAULT 'ACTIF', -- ACTIF / ANNULE
    canceled_by         INTEGER REFERENCES users(id),
    canceled_at         TIMESTAMPTZ,
    created_by          INTEGER NOT NULL REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_movements_article ON movements(article_id);
CREATE INDEX idx_movements_depot ON movements(depot_id);
CREATE INDEX idx_movements_date ON movements(movement_date);
CREATE INDEX idx_movements_lot ON movements(lot_id);
```

**Stock disponible** : jamais stocke. Toujours calcule :
```sql
SELECT m.article_id, m.lot_id, m.depot_id, m.location_id,
       SUM(m.sens * m.quantity) AS stock
FROM movements m
WHERE m.status = 'ACTIF'
GROUP BY 1,2,3,4;
```

**Blocage stock negatif** (decision 0.4) : verifie dans une transaction avant insertion :
```sql
SELECT COALESCE(SUM(sens * quantity),0) FROM movements
WHERE article_id=$art AND lot_id=$lot AND depot_id=$dep AND location_id=$loc AND status='ACTIF';
```

### 2.5 Inventaire (M5)

```sql
CREATE TABLE inventories (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(20) UNIQUE NOT NULL,  -- INV2026-09-001
    title           VARCHAR(150),
    depot_id        INTEGER REFERENCES depots(id),      -- NULL = tous depots
    location_id     INTEGER REFERENCES locations(id),
    opened_at       TIMESTAMPTZ DEFAULT now(),
    opened_by       INTEGER REFERENCES users(id),
    closed_at       TIMESTAMPTZ,
    closed_by       INTEGER REFERENCES users(id),
    status          VARCHAR(15) NOT NULL DEFAULT 'OUVERTE'  -- OUVERTE / CLOTUREE
);

CREATE TABLE inventory_lines (
    id              BIGSERIAL PRIMARY KEY,
    inventory_id    INTEGER NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
    article_id      INTEGER NOT NULL REFERENCES articles(id),
    lot_id          INTEGER REFERENCES lots(id),
    depot_id        INTEGER REFERENCES depots(id),
    location_id     INTEGER REFERENCES locations(id),
    qty_theoretical NUMERIC(14,3) NOT NULL,   -- calculee au moment de l'ouverture
    qty_counted     NUMERIC(14,3),            -- saisie magasinier
    variance        NUMERIC(14,3),            -- qty_counted - qty_theoretical
    status          VARCHAR(15) DEFAULT 'A_COMPTER',  -- A_COMPTER / COMPTE / VALIDE / REFUSE
    decision        VARCHAR(15),              -- 'AJUSTEMENT' | 'PERTE'
    loss_reason     VARCHAR(150),             -- motif obligatoire si PERTE (casse, vol...)
    movement_id     BIGINT REFERENCES movements(id),   -- mouvement genere a la validation
    counted_by      INTEGER REFERENCES users(id),
    counted_at      TIMESTAMPTZ,
    validated_by    INTEGER REFERENCES users(id),
    validated_at    TIMESTAMPTZ,
    UNIQUE(inventory_id, article_id, lot_id, location_id)
);
```

### 2.6 Prets / emprunts / restitutions (M6, correction RESTITUTION PRET / EMPRUNT)

```sql
CREATE TABLE loans (
    id            BIGSERIAL PRIMARY KEY,
    type          VARCHAR(10) NOT NULL,        -- 'PRET' | 'EMPRUNT'
    partner_id    INTEGER NOT NULL REFERENCES partners(id),   -- client / beneficiare
    article_id    INTEGER NOT NULL REFERENCES articles(id),
    quantity      NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
    unit_id       INTEGER REFERENCES units(id),
    loan_date     DATE NOT NULL,
    observation   VARCHAR(255),                -- ex. A RESTITUER (ECHANGE), DEPOTAGE
    movement_id   BIGINT REFERENCES movements(id),  -- mouvement de stock lie (0.1 -> (a))
    status        VARCHAR(15) DEFAULT 'OUVERT',    -- OUVERT / CLOTURE
    created_by    INTEGER REFERENCES users(id),    
    created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE loan_restitutions (
    id          BIGSERIAL PRIMARY KEY,
    loan_id     BIGINT NOT NULL REFERENCES loans(id),
    type        VARCHAR(20) NOT NULL,     -- 'RESTITUTION_PRET' | 'RESTITUTION_EMPRUNT'
    quantity    NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
    rest_date   DATE NOT NULL,
    movement_id BIGINT REFERENCES movements(id),   -- mouvement de stock lie
    created_by  INTEGER REFERENCES users(id),
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- Solde par operation : SUM(loans.quantity) - SUM(restitutions.quantity) pour un loan donne
```

### 2.7 Bons (M8)

```sql
CREATE TABLE bons (
    id              BIGSERIAL PRIMARY KEY,
    ref             VARCHAR(20) UNIQUE NOT NULL,   -- BS-2026-0001
    type            VARCHAR(15) NOT NULL,          -- SORTIE / LIVRAISON / TRANSFERT
    depot_id        INTEGER REFERENCES depots(id),
    depot_dest_id   INTEGER REFERENCES depots(id),
    partner_id      INTEGER REFERENCES partners(id),
    bon_date        DATE NOT NULL,
    created_by      INTEGER REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE bon_lines (
    id          BIGSERIAL PRIMARY KEY,
    bon_id      BIGINT NOT NULL REFERENCES bons(id) ON DELETE CASCADE,
    article_id  INTEGER NOT NULL REFERENCES articles(id),
    lot_id      INTEGER REFERENCES lots(id),
    quantity    NUMERIC(14,3) NOT NULL,
    unit_id     INTEGER REFERENCES units(id),
    observation VARCHAR(255)
);
```

### 2.8 Parametres et audit (M12, C4)

```sql
CREATE TABLE settings (
    id          SERIAL PRIMARY KEY,
    code        VARCHAR(40) UNIQUE NOT NULL,   -- JOURS_SECURITE, JOURS_MIN, COEF_MAXI, COEF_ALERTE, ALERTE_PEREMPTION_JOURS, ...
    value       VARCHAR(50) NOT NULL,
    label       VARCHAR(100)
);
-- Valeurs initiales : 9 / 21 / 0,5 / 1,05 / 30

CREATE TABLE audit_log (
    id          BIGSERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id),
    action      VARCHAR(20) NOT NULL,   -- CREATION / MODIFICATION / SUPPRESSION / VALIDATION / ANNULATION / CONNEXION / REFUS
    entity      VARCHAR(50) NOT NULL,   -- article, movement, inventory, loan, param, user...
    entity_id   VARCHAR(50),
    changes     JSONB,                  -- avant / apres
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id);
CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_date ON audit_log(created_at);

-- notification_alert : pre-calcul des alertes (sous-stock, peremption, inventaire en retard)
CREATE TABLE notification_alert (
    id          BIGSERIAL PRIMARY KEY,
    type        VARCHAR(30) NOT NULL,   -- SOUS_STOCK / SURSTOCK / PEREMPTION / INVENTAIRE_RETARD / PRET_NON_RESTITUE
    article_id  INTEGER REFERENCES articles(id),
    lot_id      INTEGER REFERENCES lots(id),
    message     VARCHAR(255),
    level       VARCHAR(10),            -- RED / ORANGE / GREEN
    created_at  TIMESTAMPTZ DEFAULT now(),
    resolved    BOOLEAN DEFAULT FALSE
);
```

---

## 3. REGLES D'INTEGRITE TRANSVERSES

1. **Stock jamais negatif** : blocage en transaction pour SORTIE/PERTE (0.4).
2. **TRANSFERT** : 1 saisie -> 2 mouvements lies (link_movement_id), depot source != depot destination.
3. **Annulation** : statut 'ANNULE' + audit (M10) ; pas de suppression physique.
4. **Fusion des 2 journaux Excel (D1)** : les mouvements importes gardent leur date d'origine et sont tages origine 'MIGRATION'.
5. **Lot** : obligatoire pour articles `is_lot_tracked = TRUE` (0.3) ; doublon (article, lot_number) interdit.
6. **Code article** : genere depuis code_series selon la categorie (100/200/300/400), jamais modifiable (0.7).
7. **Consommation mensuelle** : recalculable depuis les SORTIES (D3) a la cloture de chaque mois.
8. **Inventaire** : ecart valide -> AJUSTEMENT ou PERTE (motif obligatoire pour PERTE), origine inventaire tracée ; campagne cloturee non modifiable.
9. **Valorisation** : prix unitaire (D7) + historique prix ; VALEUR = stock x prix, filtrable par categorie/famille/depot.
10. **Bons PDF** : numerotation auto (M8).

---

## 4. PLAN DE MIGRATION DES DONNEES EXCEL (script Python)

1. Parcourir `PRODUIT` / `BD` -> articles (les lignes manquantes en INFO sont completees depuis BD).
2. Associer familles / categories / unites / origines / depots dans les referentiels.
3. Creer les categories et series de codes (100xxx = EMBALLAGE, 200xxx = MP, 300xxx = PIECE DE RECHANGE, 400xxx = EQUIPEMENT) et reattribuer les codes existants des articles.
4. Importer `JOURNAL E-S` + `JOURNAL E-S (2)` -> mouvements (fusion, D1), sens calcules, status ACTIF, origine MIGRATION.
5. Importer les lots de `GESTION LOTS` / `ETAT STOCK` (lot, date fab, date exp).
6. Importer `BD` : parametres (periode, frequence), partenaires manipules.
7. Importer `SITUATION` / `PRET-RESTITUTION-EMPRUNT` -> operations prets/emprunts en cours.
8. Donnees non migrees en V1 : CONS. PRODUIT (V2), RUBAN ADHESIF (V2), personnel/equipement.