# GD TRADING - MODELE DE DONNEES POSTGRESQL - PRISMA (ETAPE 7 - REV 1)

**Statut :** EN ATTENTE DE VALIDATION
**Date :** 18/09/2026
**Base :** `docs\03_CAHIER_DES_CHARGES.md` (valide) + `docs\05_ARCHITECTURE.md` (REV 1 - Prisma + TypeScript)

Ce document definit le modele de donnees **au format Prisma** (`schema.prisma`). C'est la source de verite : les migrations (`prisma migrate`) generent automatiquement le SQL PostgreSQL.

---

## 1. LISTE DES TABLES (29)

| Table | Description | Module |
|---|---|---|
| users, roles | Utilisateurs et roles | M11 |
| categories | EMBALLAGE / MATIERE PREMIERE / EQUIPEMENT / PIECE DE RECHANGE | M1 |
| code_series | Series de codes par categorie (100/200/300/400xxx) | M1 |
| families | Familles d'articles | M1 |
| units | Unites de mesure (KG, UNITE, LITRE, ML, PIECE...) | M1 |
| packaging | Conditionnements (CARTON, BOBINE, SACHET...) | M1 |
| origins | Origines (pays / continents) | M1 |
| partners | Fournisseurs, clients, entites | M1/M6 |
| depots | Etablissements (ALGER, BLIDA 1, BLIDA 2, CONSTANTINE, EXTERIEUR) | M3 |
| locations | Emplacements internes (DEPOT 1, DEPOT 2, DEPOT 1&2, EXTERIEUR, FERMENT) | M3 |
| articles | Fiches articles | M1 |
| article_consumption | Consommation mensuelle calculee (par article, mois) | M3 |
| article_orders | Arrivages / commandes en cours (ENCOURS) | M3 |
| movement_types | Types normalises (ENTREE, SORTIE, TRANSFERT, PERTE, AJUSTEMENT) | M2 |
| moves | Journal des mouvements | M2 |
| lots | Lots par article | M4 |
| inventories, inventory_lines | Campagnes d'inventaire et lignes de comptage | M5 |
| loans, loan_restitutions | Prets / emprunts / restitutions | M6 |
| reservations, reservation_lines | Reservations de stock (blocage FEFO, validation, annulation, expiration) | M13 |
| price_history | Historique des prix unitaires | M7 |
| bons, bon_lines | Bons (enregistrement simple V1) | M8 |
| settings | Parametres (seuils 9/21/0,5 / 1,05 / alerte 30j) | M12 |
| notification_alert | Alertes pre-caclculees (sous-stock, peremption, inventaire) | M9 |
| audit_log | Journal d'audit | M10 |
| enums | voir enums Prisma (type_mouvement, role, statut...) | - |

---

## 2. SCHEMA PRISMA (verbe "moves" pour mouvement)

```prisma
// ============================================================
// GD TRADING - schema.prisma (modele de donnees V1)
// Source de verite. Generer les migrations avec :
//   npx prisma migrate dev
// ============================================================

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ------------------------------------------------------------
// ENUMS
// ------------------------------------------------------------

enum RoleCode {
  ADMIN
  MAGASINIER
}

enum PartnerType {
  FOURNISSEUR
  CLIENT
  ENTITE
  AUTRE
}

enum ArticleEmploi {
  PRODUCTION
  REVENTE_EN_LETAT
  MIXTE
}

enum SourceAchat {
  INTERNATIONAL
  LOCAL
  MIXTE
  NON_DEFINI
}

enum ArticleStatut {
  ACTIVE
  INACTIVE
}

enum MoveTypeCode {
  ENTREE
  SORTIE
  TRANSFERT
  PERTE
  AJUSTEMENT
}

enum MoveStatus {
  ACTIF
  ANNULE
}

enum InventoryStatus {
  OUVERTE
  CLOTUREE
}

enum InventoryLineStatus {
  A_COMPTER
  COMPTE
  VALIDE
  REFUSE
}

enum InventoryDecision {
  AJUSTEMENT
  PERTE
}

enum LoanType {
  PRET
  EMPRUNT
}

enum RestitutionType {
  RESTITUTION_PRET
  RESTITUTION_EMPRUNT
}

enum BonType {
  SORTIE
  LIVRAISON
  TRANSFERT
}

enum AuditAction {
  CREATION
  MODIFICATION
  SUPPRESSION
  VALIDATION
  ANNULATION
  CONNEXION
  REFUS
}

enum AlertLevel {
  RED
  ORANGE
  GREEN
}

// ------------------------------------------------------------
// UTILISATEURS ET ROLES (M11)
// ------------------------------------------------------------

model User {
  id            Int      @id @default(autoincrement())
  roleId        Int
  role          Role     @relation(fields: [roleId], references: [id])
  login         String   @unique @db.VarChar(50)
  passwordHash  String   @db.VarChar(255) // bcrypt, jamais en clair
  displayName   String?  @map("display_name")
  isActive      Boolean  @default(true) @map("is_active")
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz()

  createdAtBy   User?    @relation("UserCreatedBy", fields: [createdBy], references: [id])
  createdBy     Int?
  createdUsers  User[]   @relation("UserCreatedBy")

  auditLogs     AuditLog[]
  movesMade     Move[]   @relation("MoveCreatedBy")
  movesCanceled Move[]   @relation("MoveCanceledBy")

  @@map("users")
}

model Role {
  id     Int      @id @default(autoincrement())
  code   RoleCode @unique
  label  String   @db.VarChar(50)
  users  User[]
}

// ------------------------------------------------------------
// REFERENTIELS (M1 / M12)
// ------------------------------------------------------------

model Category {
  id         Int         @id @default(autoincrement())
  code       String      @unique @db.VarChar(30) // EMBALLAGE / MATIERE_PREMIERE / EQUIPEMENT / PIECE_DE_RECHANGE
  label      String      @db.VarChar(50)
  sort       Int?
  articles   Article[]
  series     CodeSeries?
}

model CodeSeries {
  id          Int      @id @default(autoincrement())
  categoryId  Int      @unique
  category    Category @relation(fields: [categoryId], references: [id])
  prefix      String   @db.VarChar(6) // '100','200','300','400'
  nextValue   Int      @default(1) @map("next_value")
  digits      Int      @default(6)
}

model Family {
  id       Int       @id @default(autoincrement())
  code     String    @unique @db.VarChar(20)
  label    String    @db.VarChar(100)
  isActive Boolean   @default(true) @map("is_active")
  articles Article[]
}

model Unit {
  id      Int     @id @default(autoincrement())
  code    String  @unique @db.VarChar(10)
  label   String  @db.VarChar(30)
  articles Article[]
  movements Move[]
}

model Packaging {
  id      Int     @id @default(autoincrement())
  label   String  @unique @db.VarChar(50)
}

model Origin {
  id     Int     @id @default(autoincrement())
  code   String  @unique @db.VarChar(5)
  label  String  @db.VarChar(60)
  region String? @db.VarChar(60)
}

model Partner {
  id       Int         @id @default(autoincrement())
  name     String      @db.VarChar(150)
  type     PartnerType
  isActive Boolean     @default(true) @map("is_active")
}

model Depot {
  id        Int       @id @default(autoincrement())
  code      String    @unique @db.VarChar(20) // ALGER, BLIDA1, BLIDA2, CONSTANTINE, EXTERIEUR
  label     String    @db.VarChar(50)
  isActive  Boolean   @default(true) @map("is_active")
  movements Move[]
  orders    ArticleOrder[]
}

model Location {
  id        Int       @id @default(autoincrement())
  code      String    @unique @db.VarChar(20) // DEPOT1, DEPOT2, DEPOT12, EXTERIEUR, FERMENT
  label     String    @db.VarChar(50)
  isActive  Boolean   @default(true) @map("is_active")
}

// ------------------------------------------------------------
// ARTICLES (M1 / M7)
// ------------------------------------------------------------

model Article {
  id             Int             @id @default(autoincrement())
  code           String          @unique @db.VarChar(10) // genere depuis CodeSeries, jamais modifiable (0.7)
  designation    String          @db.VarChar(200)
  designation2   String?         @map("designation2") @db.VarChar(200)
  fabricant      String?         @db.VarChar(100)
  emploiGd       ArticleEmploi   @default(PRODUCTION) @map("emploi_gd")
  categoryId     Int
  category       Category        @relation(fields: [categoryId], references: [id])
  familyId       Int?
  family         Family?         @relation(fields: [familyId], references: [id])
  application    String?         @db.VarChar(150)
  unitId         Int
  unit           Unit            @relation(fields: [unitId], references: [id])
  packagingId    Int?
  packaging      Packaging?      @relation(fields: [packagingId], references: [id])
  sourceAchat    SourceAchat?    @map("source_achat")
  originId       Int?
  origin         Origin?         @relation(fields: [originId], references: [id])
  periode        String?         @db.VarChar(20)  // ANNUELLE(360), BIMESTRIELLE(180)...
  frequence      Int?                            // 360, 180, 90, 30...
  statut         ArticleStatut   @default(ACTIVE)
  unitPrice      Decimal?        @map("unit_price") @db.Decimal(14, 4) // saisi manuellement (D7) - REPLI, le prix du lot prime (D11)
  isLotTracked   Boolean         @default(false) @map("is_lot_tracked") // perissable / lot-trace (0.3)

  createdAt      DateTime        @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt      DateTime        @updatedAt @map("updated_at") @db.Timestamptz()

  consumptions   ArticleConsumption[]
  orders         ArticleOrder[]
  priceHistory   PriceHistory[]
  lots           Lot[]
  movements      Move[]
  minventoryLines InventoryLine[]
  loans          Loan[]

  @@index([familyId])
  @@index([categoryId])
  @@map("articles")
}

// Consommation mensuelle (D3) : calculee depuis les sorties, par mois
model ArticleConsumption {
  id        Int            @id @default(autoincrement())
  articleId Int
  article   Article        @relation(fields: [articleId], references: [id])
  year      Int
  month     Int
  quantity  Decimal        @default(0) @db.Decimal(14, 3)

  @@unique([articleId, year, month])
  @@map("article_consumption")
}

// Arrivages / commandes en cours (ENCOURS -> stock virtuel)
model ArticleOrder {
  id           Int       @id @default(autoincrement())
  articleId    Int
  article      Article   @relation(fields: [articleId], references: [id])
  quantity     Decimal   @db.Decimal(14, 3)
  expectedDate DateTime  @map("expected_date") @db.Date
  supplierId   Int?
  supplier     Partner?  @relation(fields: [supplierId], references: [id])
  arrived      Boolean   @default(false)
  depotId      Int?
  depot        Depot?    @relation(fields: [depotId], references: [id])
  createdAt    DateTime  @default(now()) @map("created_at") @db.Timestamptz()

  @@map("article_orders")
}

// Historique des prix (D7 - prix modifiable, historique conserve)
model PriceHistory {
  id        Int      @id @default(autoincrement())
  articleId Int
  article   Article  @relation(fields: [articleId], references: [id])
  unitPrice Decimal  @map("unit_price") @db.Decimal(14, 4)
  changedBy Int?
  changedAt DateTime @default(now()) @map("changed_at") @db.Timestamptz()

  @@map("price_history")
}

// ------------------------------------------------------------
// LOTS (M4) ET MOUVEMENTS (M2)
// ------------------------------------------------------------

model Lot {
  id          Int       @id @default(autoincrement())
  articleId   Int
  article     Article   @relation(fields: [articleId], references: [id])
  lotNumber   String    @map("lot_number") @db.VarChar(50)
  fabricDate  DateTime? @map("fabric_date") @db.Date
  expiryDate  DateTime? @map("expiry_date") @db.Date
  unitPrice   Decimal?  @map("unit_price") @db.Decimal(14, 4) // prix du lot : prime sur le prix de l'article (D11)
  observation String?   @db.Text

  movements      Move[]
  inventoryLines InventoryLine[]
  bonLines       BonLine[]

  @@unique([articleId, lotNumber])
  @@index([expiryDate])
  @@map("lots")
}

model MoveType {
  id    Int          @id @default(autoincrement())
  code  MoveTypeCode @unique
  label String       @db.VarChar(30)
  sens  Int          // +1 / -1
}

// JOURNAL DES MOUVEMENTS
model Move {
  id              BigInt      @id @default(autoincrement()) @db.Bigint
  typeId          Int
  type            MoveType    @relation(fields: [typeId], references: [id])
  articleId       Int
  article         Article     @relation(fields: [articleId], references: [id])
  lotId           Int?
  lot             Lot?        @relation(fields: [lotId], references: [id])
  quantity        Decimal     @db.Decimal(14, 3)
  sens            Int // +1 / -1, calcule d'apres le type
  depotId         Int
  depot           Depot       @relation(fields: [depotId], references: [id])
  locationId      Int?
  location        Location?   @relation(fields: [locationId], references: [id])
  depotDestId     Int?        @map("depot_dest_id") // TRANSFERT
  locationDestId  Int?        @map("location_dest_id")
  partnerId       Int?
  partner         Partner?    @relation(fields: [partnerId], references: [id])
  docNumber       String?     @map("doc_number") @db.VarChar(50)
  unitPrice       Decimal?    @map("unit_price") @db.Decimal(14, 4)
  movementDate    DateTime    @map("movement_date") @db.Date
  observation     String?     @db.VarChar(255)
  linkMoveId      BigInt?     @map("link_move_id") // lien sortie <-> entree d'un transfert
  linkMove        Move?       @relation("MoveLink", fields: [linkMoveId], references: [id])
  linkedMoves     Move[]      @relation("MoveLink")
  remediation     String?     @db.VarChar(20) // 'MIGRATION' pour l'historique Excel
  inventoryId     Int?
  inventory       Inventory?  @relation(fields: [inventoryId], references: [id])
  status          MoveStatus  @default(ACTIF)
  canceledBy      Int?
  canceler        User?       @relation("MoveCanceledBy", fields: [canceledBy], references: [id])
  canceledAt      DateTime?   @map("canceled_at") @db.Timestamptz()
  createdBy       Int
  creator         User?       @relation("MoveCreatedBy", fields: [createdBy], references: [id])
  createdAt       DateTime    @default(now()) @map("created_at") @db.Timestamptz()

  loan            Loan?
  restitutions    LoanRestitution[]

  @@index([articleId])
  @@index([lotId])
  @@index([depotId])
  @@index([movementDate])
  @@map("moves")
}

// ------------------------------------------------------------
// INVENTAIRE (M5 / C1)
// ------------------------------------------------------------

model Inventory {
  id        BigInt          @id @default(autoincrement()) @db.Bigint
  code      String          @unique @db.VarChar(20) // INV-2026-09-001
  title     String?         @db.VarChar(150)
  depotId   Int?
  depot     Depot?          @relation(fields: [depotId], references: [id])
  openedAt  DateTime        @default(now()) @map("opened_at") @db.Timestamptz()
  openedBy  Int
  closedAt  DateTime?       @map("closed_at") @db.Timestamptz()
  closedBy  Int?
  status    InventoryStatus @default(OUVERTE)

  lines       InventoryLine[]
  movements   Move[]

  @@map("inventories")
}

model InventoryLine {
  id             BigInt               @id @default(autoincrement()) @db.Bigint
  inventoryId    BigInt
  inventory      Inventory            @relation(fields: [inventoryId], references: [id], onDelete: Cascade)
  articleId      Int
  article        Article              @relation(fields: [articleId], references: [id])
  lotId          Int?
  lot            Lot?                 @relation(fields: [lotId], references: [id])
  depotId        Int?
  locationId     Int?
  qtyTheoretical Decimal              @map("qty_theoretical") @db.Decimal(14, 3)
  qtyCounted     Decimal?             @map("qty_counted") @db.Decimal(14, 3)
  variance       Decimal?             @db.Decimal(14, 3) // qty_counted - qty_theoretical
  status         InventoryLineStatus  @default(A_COMPTER)
  decision       InventoryDecision?
  lossReason     String?              @map("loss_reason") @db.VarChar(150)
  movementId     BigInt?
  countedBy      Int?
  countedAt      DateTime?            @map("counted_at") @db.Timestamptz()
  validatedBy    Int?
  validatedAt    DateTime?            @map("validated_at") @db.Timestamptz()

  @@unique([inventoryId, articleId, lotId, locationId])
  @@map("inventory_lines")
}

// ------------------------------------------------------------
// PRETS / EMPRUNTS / RESTITUTIONS (M6)
// ------------------------------------------------------------

model Loan {
  id          BigInt      @id @default(autoincrement()) @db.Bigint
  type        LoanType
  partnerId   Int
  partner     Partner     @relation(fields: [partnerId], references: [id])
  articleId   Int
  article     Article     @relation(fields: [articleId], references: [id])
  quantity    Decimal     @db.Decimal(14, 3)
  loanDate    DateTime    @map("loan_date") @db.Date
  observation String?     @db.VarChar(255)
  movementId  BigInt?     @unique // mouvement de stock lie (0.1 -> sortie / entree)
  status      String      @default("OUVERT") // OUVERT / CLOTURE
  createdAt   DateTime    @default(now()) @map("created_at") @db.Timestamptz()

  restitutions LoanRestitution[]

  @@map("loans")
}

model LoanRestitution {
  id          BigInt          @id @default(autoincrement()) @db.Bigint
  loanId      BigInt
  loan        Loan            @relation(fields: [loanId], references: [id])
  type        RestitutionType // RESTITUTION_PRET / RESTITUTION_EMPRUNT
  quantity    Decimal         @db.Decimal(14, 3)
  restDate    DateTime        @map("rest_date") @db.Date
  movementId  BigInt?         @unique // mouvement de stock lie (reinintegration / retrait)
  createdAt   DateTime        @default(now()) @map("created_at") @db.Timestamptz()

  @@map("loan_restitutions")
}

// ------------------------------------------------------------
// RESERVATIONS DE STOCK (M13 - blocage FEFO, validation / annulation / expiration)
// Le blocage est porte par des mouvements de type RESERVATION (sens -1) rattaches a
// la reservation via moves.reservation_id. A la validation, ces mouvements passent en
// SORTIE ; a l'annulation ou a l'expiration, ils passent en ANNULE, donc le stock est
// rendu. Statuts : ACTIF / REALISE / ANNULE / EXPIRE.
// ------------------------------------------------------------

enum ReservationStatus {
  ACTIF
  REALISE
  ANNULE
  EXPIRE
}

model Reservation {
  id          BigInt            @id @default(autoincrement()) @db.BigInt
  ref         String            @unique @db.VarChar(30) // RSV-2026-0001
  partnerId   Int
  partner     Partner           @relation(fields: [partnerId], references: [id])
  staffLabel String            @map("staff_label") @db.VarChar(100) // saisie libre
  staffId     Int?
  staff       User?             @relation("ReservationStaff", fields: [staffId], references: [id])
  startDate   DateTime          @map("start_date") @db.Date
  endDate     DateTime          @map("end_date") @db.Date
  status      ReservationStatus @default(ACTIF)
  observation String?           @db.VarChar(255)
  createdBy   Int
  creator     User?             @relation("ReservationCreatedBy", fields: [createdBy], references: [id])
  createdAt   DateTime          @default(now()) @map("created_at") @db.Timestamptz()
  closedBy    Int?
  closer      User?             @relation("ReservationClosedBy", fields: [closedBy], references: [id])
  closedAt    DateTime?         @map("closed_at") @db.Timestamptz()
  closeReason String?           @map("close_reason") @db.VarChar(20) // VALIDEE / MANUEL / EXPIRE

  lines ReservationLine[]
  moves Move[]

  @@index([status])
  @@index([endDate])
  @@index([partnerId])
  @@map("reservations")
}

model ReservationLine {
  id            BigInt      @id @default(autoincrement()) @db.BigInt
  reservationId BigInt
  reservation   Reservation @relation(fields: [reservationId], references: [id], onDelete: Cascade)
  articleId     Int
  article       Article     @relation(fields: [articleId], references: [id])
  quantity      Decimal     @db.Decimal(14, 3)

  @@index([articleId])
  @@map("reservation_lines")
}

// ------------------------------------------------------------
// BONS (M8 - V1 : enregistrement simple, sans impression conforme - A4)
// ------------------------------------------------------------

model Bon {
  id          BigInt  @id @default(autoincrement()) @db.Bigint
  ref         String  @unique @db.VarChar(20) // BS-2026-0001
  type        BonType
  depotId     Int?
  depot       Depot?  @relation(fields: [depotId], references: [id])
  depotDestId Int?
  partnerId   Int?
  partner     Partner? @relation(fields: [partnerId], references: [id])
  bonDate     DateTime @map("bon_date") @db.Date
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz()

  lines BonLine[]

  @@map("bons")
}

model BonLine {
  id          BigInt  @id @default(autoincrement()) @db.Bigint
  bonId       BigInt
  bon         Bon     @relation(fields: [bonId], references: [id], onDelete: Cascade)
  articleId   Int
  article     Article @relation(fields: [articleId], references: [id])
  lotId       Int?
  lot         Lot?    @relation(fields: [lotId], references: [id])
  quantity    Decimal @db.Decimal(14, 3)
  observation String? @db.VarChar(255)

  @@map("bon_lines")
}

// ------------------------------------------------------------
// PARAMETRES (M12) / ALERTES (M9) / AUDIT (M10 / C4)
// ------------------------------------------------------------

model Setting {
  id    Int     @id @default(autoincrement())
  code  String  @unique @db.VarChar(40)
  value String  @db.VarChar(50)
  label String? @db.VarChar(100)

  @@map("settings")
}

model NotificationAlert {
  id        BigInt     @id @default(autoincrement()) @db.Bigint
  type      String     @db.VarChar(30) // SOUS_STOCK / SURSTOCK / PEREMPTION / INVENTAIRE_RETARD / PRET_NON_RESTITUE
  articleId Int?
  lotId     Int?
  message   String?    @db.VarChar(255)
  level     AlertLevel
  createdAt DateTime   @default(now()) @map("created_at") @db.Timestamptz()
  resolved  Boolean    @default(false)

  @@map("notification_alert")
}

model AuditLog {
  id        BigInt      @id @default(autoincrement()) @db.Bigint
  userId    Int?
  user      User?       @relation(fields: [userId], references: [id])
  action    AuditAction
  entity    String      @db.VarChar(50)
  entityId  String?     @map("entity_id")
  changes   Json?
  createdAt DateTime    @default(now()) @map("created_at") @db.Timestamptz()

  @@index([entity, entityId])
  @@index([userId])
  @@map("audit_log")
}
```

---

## 3. REGLES D'INTEGRITE TRANSVERSES (implementees dans les services metier)

1. **Stock jamais negatif** : verifie dans une transaction Prisma pour SORTIE / PERTE (0.4) - `sum(sens * quantity)` sur les mouvements ACTIFS.
2. **TRANSFERT** : 1 saisie -> 2 mouvements lies (linkMoveId), depot source != destination.
3. **Annulation** : statut ANNULE + audit (M10), jamais de suppression physique.
4. **Fusion des 2 journaux Excel (D1)** : mouvements importes avec leurs dates d'origine et origine 'MIGRATION'.
5. **Lot** : obligatoire pour articles `isLotTracked = true` (0.3) ; doublon (article, lotNumber) interdit.
6. **Code article** : genere depuis CodeSeries selon la categorie (100/200/300/400), jamais modifiable (0.7). Un article supprime une serie ? non - le compteur avance seul.
7. **Consommation mensuelle** (D3) : calculee depuis les SORTIES, recalculable a la cloture de chaque mois.
8. **Inventaire** : ecart valide -> AJUSTEMENT ou PERTE (motif obligatoire pour PERTE), origine inventaire tracee ; campagne CLOTUREE non modifiable.
9. **Valorisation** (D7, D11) : le prix est porte par le **lot** (`lots.unit_price`, saisi a la creation du lot et suivi toute sa vie) ; le prix de la fiche article (`articles.unit_price`, historique dans `price_history`) n'est qu'un **repli** pour les lots sans prix propre. VALEUR LOT = quantite x prix applique ; au niveau article, PRIX MOYEN = SOMME(prix applique x quantite) / SOMME(quantite).
10. **Bons V1** (A4) : enregistrement seul, sans generation PDF conforme.

---

## 4. PLAN DE MIGRATION DES DONNEES EXCEL (scripts Python)

1. Lire `PRODUIT` / `BD` -> articles (completer les lignes manquantes depuis BD).
2. Creer les referentiels : familles, categories (4), unites, conditionnements, origines, depots, emplacements.
3. Creer les CodeSeries (100/200/300/400) et reattribuer les codes existants des articles.
4. Importer `JOURNAL E-S` + `JOURNAL E-S (2)` -> Move (fusion D1), sens = +1/-1, status ACTIF, remediation 'MIGRATION'.
5. Importer les lots de `GESTION LOTS` / `ETAT STOCK` (lot, date fab, date exp).
6. Importer de `BD` : parametres periode/frequence, acteurs, entites.
7. Importer `SITUATION` / `PRET-RESTITUTION-EMPRUNT` -> operations pret/emprunt en cours (OUVERT).
8. Non migre en V1 : CONS. PRODUIT / RUBAN ADHESIF (V2), personnel/equipement (hors perimetre).