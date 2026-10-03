-- D20 : retrait du type "Reservation" du referentiel des types de mouvement.
--
-- Doit preceder `ALTER TYPE "MoveTypeCode" DROP VALUE` (migration
-- 20261003100400) : PostgreSQL refuse de retirer une valeur d'enum encore
-- referencee par une ligne.
--
-- Les mouvements de ce type ont deja ete supprimes en 20261003095000.
DELETE FROM "MoveType" WHERE "code" = 'RESERVATION';