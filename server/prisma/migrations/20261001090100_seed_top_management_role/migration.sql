-- Insert : ligne de Role correspondant au nouvel enum.
-- Migration distincte de celle qui ajoute la valeur d'enum : PostgreSQL interdit
-- d'utiliser une valeur d'enum dans la meme transaction que son ADD VALUE, et Prisma
-- encapsule chaque migration dans une transaction. Meme demarche que
-- 20260927102000_seed_reservation_move_type.
INSERT INTO "Role" ("code", "label") VALUES ('TOP_MANAGEMENT', 'Direction générale');