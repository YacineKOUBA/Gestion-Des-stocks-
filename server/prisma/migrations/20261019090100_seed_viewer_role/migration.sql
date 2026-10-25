-- Insert : ligne de Role correspondant au nouvel enum.
-- Migration distincte de celle qui ajoute la valeur d'enum : PostgreSQL interdit
-- d'utiliser une valeur d'enum dans la meme transaction que son ADD VALUE, et Prisma
-- encapsule chaque migration dans une transaction. Meme demarche que
-- 20261005120100_seed_master_data_role et 20261001090100_seed_top_management_role.
INSERT INTO "Role" ("code", "label") VALUES ('VIEWER', 'Consultant');
