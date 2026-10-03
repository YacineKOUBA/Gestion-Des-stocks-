-- CreateTable : le detail FEFO fige par une reservation.
--
-- D20, regle 2 : la creation d'une reservation fige, lot par lot, les quantites
-- promis. C'est cette table, et non le stock, qui dit ce qu'une reservation a
-- reellement reserve.
--
-- `quantity`       quantite promise sur ce lot / depot / emplacement
-- `taken_quantity` quantite de cette part qu'une sortie exterieure a consommee
--                  avec l'accord explicite de l'utilisateur (regle 3). Vaut 0 en
--                  regime normal. Si elle devient > 0 a la validation, c'est la
--                  difference entre la promesse et ce que le lot peut encore
--                  fournir : le manque se reconstitue par un second FEFO (regle 4).
--
-- Nommage des colonnes : Prisma n'applique un nom physique different du nom du
-- champ que si le champ porte un @map. Sans @map, la colonne doit s'appeler
-- exactement comme le champ. D'ou le melange volontaire ci-dessous, qui est
-- celui de tout le reste du schema :
--   - `reservationId`, `reservationLineId`, `articleId`, `lotId`, `depotId`,
--     `locationId` : nom du champ, sans @map ;
--   - `taken_quantity` : le champ `takenQuantity` porte bien un @map.
--
-- Aucune colonne de devise : aucun de ces mouvements ne porte de montant. La
-- devise reste portee par le mouvement SORTIE cree a la validation.

CREATE TABLE "reservation_allocations" (
    "id" BIGSERIAL NOT NULL,
    "reservationId" BIGINT NOT NULL,
    "reservationLineId" BIGINT NOT NULL,
    "articleId" INTEGER NOT NULL,
    "lotId" INTEGER,
    "depotId" INTEGER NOT NULL,
    "locationId" INTEGER,
    "quantity" DECIMAL(14,3) NOT NULL,
    "taken_quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,

    CONSTRAINT "reservation_allocations_pkey" PRIMARY KEY ("id")
);

-- Index de lecture : le calcul de "deja reserve" par article, et le controle
-- d'empietement sur un lot precis.
CREATE INDEX "reservation_allocations_articleId_idx" ON "reservation_allocations"("articleId");
CREATE INDEX "reservation_allocations_lotId_idx" ON "reservation_allocations"("lotId");
CREATE INDEX "reservation_allocations_reservationId_idx" ON "reservation_allocations"("reservationId");

ALTER TABLE "reservation_allocations"
  ADD CONSTRAINT "reservation_allocations_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "reservations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reservation_allocations"
  ADD CONSTRAINT "reservation_allocations_reservationLineId_fkey"
  FOREIGN KEY ("reservationLineId") REFERENCES "reservation_lines"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reservation_allocations"
  ADD CONSTRAINT "reservation_allocations_articleId_fkey"
  FOREIGN KEY ("articleId") REFERENCES "articles"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- `lots"."id` est un INTEGER (et non un BIGINT comme les reservations). Le type
-- doit correspondre exactement, sinon Prisma refuse le schema.
ALTER TABLE "reservation_allocations"
  ADD CONSTRAINT "reservation_allocations_lotId_fkey"
  FOREIGN KEY ("lotId") REFERENCES "lots"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "reservation_allocations"
  ADD CONSTRAINT "reservation_allocations_depotId_fkey"
  FOREIGN KEY ("depotId") REFERENCES "Depot"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reservation_allocations"
  ADD CONSTRAINT "reservation_allocations_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;