-- Le personnel d'une reservation est libre : il peut ne correspondre a aucun utilisateur.
-- Le texte saisi est conserve tel quel dans staff_label ; le lien staff_id reste
-- renseignee uniquement lorsque le texte correspond a un utilisateur existant.
ALTER TABLE "reservations" ADD COLUMN "staff_label" VARCHAR(100);

UPDATE "reservations" r
SET "staff_label" = COALESCE(u."display_name", u."login")
FROM "users" u
WHERE u."id" = r."staffId";

DELETE FROM "reservations" WHERE "staff_label" IS NULL;

ALTER TABLE "reservations" ALTER COLUMN "staff_label" SET NOT NULL;
ALTER TABLE "reservations" ALTER COLUMN "staffId" DROP NOT NULL;
