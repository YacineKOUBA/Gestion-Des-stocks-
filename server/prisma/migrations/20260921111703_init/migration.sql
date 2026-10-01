-- CreateEnum
CREATE TYPE "RoleCode" AS ENUM ('ADMIN', 'MAGASINIER');

-- CreateEnum
CREATE TYPE "PartnerType" AS ENUM ('FOURNISSEUR', 'CLIENT', 'ENTITE', 'AUTRE');

-- CreateEnum
CREATE TYPE "ArticleEmploi" AS ENUM ('PRODUCTION', 'REVENTE_EN_LETAT', 'MIXTE');

-- CreateEnum
CREATE TYPE "SourceAchat" AS ENUM ('INTERNATIONAL', 'LOCAL', 'MIXTE', 'NON_DEFINI');

-- CreateEnum
CREATE TYPE "ArticleStatut" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "MoveTypeCode" AS ENUM ('ENTREE', 'SORTIE', 'TRANSFERT', 'PERTE', 'AJUSTEMENT');

-- CreateEnum
CREATE TYPE "MoveStatus" AS ENUM ('ACTIF', 'ANNULE');

-- CreateEnum
CREATE TYPE "InventoryStatus" AS ENUM ('OUVERTE', 'CLOTUREE');

-- CreateEnum
CREATE TYPE "InventoryLineStatus" AS ENUM ('A_COMPTER', 'COMPTE', 'VALIDE', 'REFUSE');

-- CreateEnum
CREATE TYPE "InventoryDecision" AS ENUM ('AJUSTEMENT', 'PERTE');

-- CreateEnum
CREATE TYPE "LoanType" AS ENUM ('PRET', 'EMPRUNT');

-- CreateEnum
CREATE TYPE "RestitutionType" AS ENUM ('RESTITUTION_PRET', 'RESTITUTION_EMPRUNT');

-- CreateEnum
CREATE TYPE "BonType" AS ENUM ('SORTIE', 'LIVRAISON', 'TRANSFERT');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATION', 'MODIFICATION', 'SUPPRESSION', 'VALIDATION', 'ANNULATION', 'CONNEXION', 'REFUS');

-- CreateEnum
CREATE TYPE "AlertLevel" AS ENUM ('RED', 'ORANGE', 'GREEN');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "roleId" INTEGER NOT NULL,
    "login" VARCHAR(50) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "display_name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" INTEGER,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" SERIAL NOT NULL,
    "code" "RoleCode" NOT NULL,
    "label" VARCHAR(50) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "label" VARCHAR(50) NOT NULL,
    "sort" INTEGER,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeSeries" (
    "id" SERIAL NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "prefix" VARCHAR(6) NOT NULL,
    "next_value" INTEGER NOT NULL DEFAULT 1,
    "digits" INTEGER NOT NULL DEFAULT 6,

    CONSTRAINT "CodeSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Family" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Family_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "label" VARCHAR(30) NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Packaging" (
    "id" SERIAL NOT NULL,
    "label" VARCHAR(50) NOT NULL,

    CONSTRAINT "Packaging_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Origin" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(5) NOT NULL,
    "label" VARCHAR(60) NOT NULL,
    "region" VARCHAR(60),

    CONSTRAINT "Origin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partner" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "type" "PartnerType" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Depot" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "label" VARCHAR(50) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Depot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "label" VARCHAR(50) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articles" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "designation" VARCHAR(200) NOT NULL,
    "designation_2" VARCHAR(200),
    "fabricant" VARCHAR(100),
    "emploi_gd" "ArticleEmploi" NOT NULL DEFAULT 'PRODUCTION',
    "categoryId" INTEGER NOT NULL,
    "familyId" INTEGER,
    "application" VARCHAR(150),
    "unitId" INTEGER NOT NULL,
    "packagingId" INTEGER,
    "source_achat" "SourceAchat",
    "originId" INTEGER,
    "periode" VARCHAR(20),
    "frequence" INTEGER,
    "statut" "ArticleStatut" NOT NULL DEFAULT 'ACTIVE',
    "unit_price" DECIMAL(14,4),
    "is_lot_tracked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_consumption" (
    "id" SERIAL NOT NULL,
    "articleId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,

    CONSTRAINT "article_consumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_orders" (
    "id" SERIAL NOT NULL,
    "articleId" INTEGER NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "expected_date" DATE NOT NULL,
    "supplierId" INTEGER,
    "arrived" BOOLEAN NOT NULL DEFAULT false,
    "depotId" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_history" (
    "id" SERIAL NOT NULL,
    "articleId" INTEGER NOT NULL,
    "unit_price" DECIMAL(14,4) NOT NULL,
    "changedBy" INTEGER,
    "changed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lots" (
    "id" SERIAL NOT NULL,
    "articleId" INTEGER NOT NULL,
    "lot_number" VARCHAR(50) NOT NULL,
    "fabric_date" DATE,
    "expiry_date" DATE,

    CONSTRAINT "lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoveType" (
    "id" SERIAL NOT NULL,
    "code" "MoveTypeCode" NOT NULL,
    "label" VARCHAR(30) NOT NULL,
    "sens" INTEGER NOT NULL,

    CONSTRAINT "MoveType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moves" (
    "id" BIGSERIAL NOT NULL,
    "typeId" INTEGER NOT NULL,
    "articleId" INTEGER NOT NULL,
    "lotId" INTEGER,
    "quantity" DECIMAL(14,3) NOT NULL,
    "sens" INTEGER NOT NULL,
    "depotId" INTEGER NOT NULL,
    "locationId" INTEGER,
    "depot_dest_id" INTEGER,
    "location_dest_id" INTEGER,
    "partnerId" INTEGER,
    "doc_number" VARCHAR(50),
    "unit_price" DECIMAL(14,4),
    "movement_date" DATE NOT NULL,
    "observation" VARCHAR(255),
    "link_move_id" BIGINT,
    "remediation" VARCHAR(20),
    "inventoryId" BIGINT,
    "status" "MoveStatus" NOT NULL DEFAULT 'ACTIF',
    "canceledBy" INTEGER,
    "canceled_at" TIMESTAMPTZ,
    "createdBy" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventories" (
    "id" BIGSERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "title" VARCHAR(150),
    "depotId" INTEGER,
    "opened_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedBy" INTEGER NOT NULL,
    "closed_at" TIMESTAMPTZ,
    "closedBy" INTEGER,
    "status" "InventoryStatus" NOT NULL DEFAULT 'OUVERTE',

    CONSTRAINT "inventories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_lines" (
    "id" BIGSERIAL NOT NULL,
    "inventoryId" BIGINT NOT NULL,
    "articleId" INTEGER NOT NULL,
    "lotId" INTEGER,
    "qty_theoretical" DECIMAL(14,3) NOT NULL,
    "qty_counted" DECIMAL(14,3),
    "variance" DECIMAL(14,3),
    "status" "InventoryLineStatus" NOT NULL DEFAULT 'A_COMPTER',
    "decision" "InventoryDecision",
    "loss_reason" VARCHAR(150),
    "movementId" BIGINT,
    "counted_at" TIMESTAMPTZ,
    "countedBy" INTEGER,
    "validated_at" TIMESTAMPTZ,
    "validatedBy" INTEGER,

    CONSTRAINT "inventory_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loans" (
    "id" BIGSERIAL NOT NULL,
    "type" "LoanType" NOT NULL,
    "partnerId" INTEGER NOT NULL,
    "articleId" INTEGER NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "loan_date" DATE NOT NULL,
    "observation" VARCHAR(255),
    "movementId" BIGINT,
    "status" TEXT NOT NULL DEFAULT 'OUVERT',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_restitutions" (
    "id" BIGSERIAL NOT NULL,
    "loanId" BIGINT NOT NULL,
    "type" "RestitutionType" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "rest_date" DATE NOT NULL,
    "movementId" BIGINT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_restitutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bons" (
    "id" BIGSERIAL NOT NULL,
    "ref" VARCHAR(20) NOT NULL,
    "type" "BonType" NOT NULL,
    "depotId" INTEGER,
    "depot_dest_id" INTEGER,
    "partnerId" INTEGER,
    "bon_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bon_lines" (
    "id" BIGSERIAL NOT NULL,
    "bonId" BIGINT NOT NULL,
    "articleId" INTEGER NOT NULL,
    "lotId" INTEGER,
    "quantity" DECIMAL(14,3) NOT NULL,
    "observation" VARCHAR(255),

    CONSTRAINT "bon_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "value" VARCHAR(50) NOT NULL,
    "label" VARCHAR(100),

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_alert" (
    "id" BIGSERIAL NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "articleId" INTEGER,
    "lotId" INTEGER,
    "message" VARCHAR(255),
    "level" "AlertLevel" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "notification_alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "userId" INTEGER,
    "action" "AuditAction" NOT NULL,
    "entity" VARCHAR(50) NOT NULL,
    "entity_id" TEXT,
    "changes" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_login_key" ON "users"("login");

-- CreateIndex
CREATE INDEX "users_roleId_idx" ON "users"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Category_code_key" ON "Category"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CodeSeries_categoryId_key" ON "CodeSeries"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Family_code_key" ON "Family"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_code_key" ON "Unit"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Packaging_label_key" ON "Packaging"("label");

-- CreateIndex
CREATE UNIQUE INDEX "Origin_code_key" ON "Origin"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Depot_code_key" ON "Depot"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Location_code_key" ON "Location"("code");

-- CreateIndex
CREATE UNIQUE INDEX "articles_code_key" ON "articles"("code");

-- CreateIndex
CREATE INDEX "articles_familyId_idx" ON "articles"("familyId");

-- CreateIndex
CREATE INDEX "articles_categoryId_idx" ON "articles"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "article_consumption_articleId_year_month_key" ON "article_consumption"("articleId", "year", "month");

-- CreateIndex
CREATE INDEX "lots_expiry_date_idx" ON "lots"("expiry_date");

-- CreateIndex
CREATE UNIQUE INDEX "lots_articleId_lot_number_key" ON "lots"("articleId", "lot_number");

-- CreateIndex
CREATE UNIQUE INDEX "MoveType_code_key" ON "MoveType"("code");

-- CreateIndex
CREATE INDEX "moves_articleId_idx" ON "moves"("articleId");

-- CreateIndex
CREATE INDEX "moves_lotId_idx" ON "moves"("lotId");

-- CreateIndex
CREATE INDEX "moves_depotId_idx" ON "moves"("depotId");

-- CreateIndex
CREATE INDEX "moves_movement_date_idx" ON "moves"("movement_date");

-- CreateIndex
CREATE UNIQUE INDEX "inventories_code_key" ON "inventories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_lines_inventoryId_articleId_lotId_key" ON "inventory_lines"("inventoryId", "articleId", "lotId");

-- CreateIndex
CREATE UNIQUE INDEX "loans_movementId_key" ON "loans"("movementId");

-- CreateIndex
CREATE UNIQUE INDEX "loan_restitutions_movementId_key" ON "loan_restitutions"("movementId");

-- CreateIndex
CREATE UNIQUE INDEX "bons_ref_key" ON "bons"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "settings_code_key" ON "settings"("code");

-- CreateIndex
CREATE INDEX "audit_log_entity_entity_id_idx" ON "audit_log"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_userId_idx" ON "audit_log"("userId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeSeries" ADD CONSTRAINT "CodeSeries_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_packagingId_fkey" FOREIGN KEY ("packagingId") REFERENCES "Packaging"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_originId_fkey" FOREIGN KEY ("originId") REFERENCES "Origin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_consumption" ADD CONSTRAINT "article_consumption_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_orders" ADD CONSTRAINT "article_orders_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_orders" ADD CONSTRAINT "article_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_orders" ADD CONSTRAINT "article_orders_depotId_fkey" FOREIGN KEY ("depotId") REFERENCES "Depot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moves" ADD CONSTRAINT "moves_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "MoveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moves" ADD CONSTRAINT "moves_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moves" ADD CONSTRAINT "moves_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moves" ADD CONSTRAINT "moves_depotId_fkey" FOREIGN KEY ("depotId") REFERENCES "Depot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moves" ADD CONSTRAINT "moves_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moves" ADD CONSTRAINT "moves_link_move_id_fkey" FOREIGN KEY ("link_move_id") REFERENCES "moves"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moves" ADD CONSTRAINT "moves_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "inventories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moves" ADD CONSTRAINT "moves_canceledBy_fkey" FOREIGN KEY ("canceledBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moves" ADD CONSTRAINT "moves_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_depotId_fkey" FOREIGN KEY ("depotId") REFERENCES "Depot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_lines" ADD CONSTRAINT "inventory_lines_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "inventories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_lines" ADD CONSTRAINT "inventory_lines_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_lines" ADD CONSTRAINT "inventory_lines_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "moves"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_restitutions" ADD CONSTRAINT "loan_restitutions_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_restitutions" ADD CONSTRAINT "loan_restitutions_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "moves"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bons" ADD CONSTRAINT "bons_depotId_fkey" FOREIGN KEY ("depotId") REFERENCES "Depot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bons" ADD CONSTRAINT "bons_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bon_lines" ADD CONSTRAINT "bon_lines_bonId_fkey" FOREIGN KEY ("bonId") REFERENCES "bons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bon_lines" ADD CONSTRAINT "bon_lines_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bon_lines" ADD CONSTRAINT "bon_lines_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
