-- Insert : ligne de Role correspondant au nouvel enum.
-- Migration distincte de celle qui ajoute la valeur d'enum : PostgreSQL interdit
-- d'utiliser une valeur d'enum dans la meme transaction que son ADD VALUE, et Prisma
-- encapsule chaque migration dans une transaction. Meme demarche que
-- 20261001090100_seed_top_management_role et 20261001090300_seed_sales_admin_role.
INSERT INTO "Role" ("code", "label") VALUES ('MASTER_DATA', 'Master Data');