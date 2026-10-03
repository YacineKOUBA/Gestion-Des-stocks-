-- D20 : retrait definitif de la valeur RESERVATION de l'enum "MoveTypeCode".
--
-- Ordre imperatif, chaque etape dans SA transaction (Prisma encapsule chaque
-- migration) :
--
--   20261003095000  suppression des mouvements de ce type
--   20261003096000  suppression du mouvement de blocage fantome
--   20261003100300  suppression de la ligne de reference "MoveType"
--   20261003100400  (ce fichier) retrait de la valeur de l'enum
--
-- Pourquoi l'enum et la table sont traites separement : la valeur ne peut etre
-- retiree que si plus aucune ligne ne la reference.
--
-- ATTENTION : PostgreSQL ne propose PAS "ALTER TYPE ... DROP VALUE". Seuls
-- ADD VALUE et RENAME VALUE existent. Le retrait exige de RECREER le type.
-- Verifie sur la version 16.15 de ce serveur : DROP VALUE echoue en erreur de
-- syntaxe.
--
-- L'enum n'est utilise que par la colonne "MoveType"."code". La colonne
-- "moves"."typeId" est un entier, donc la reconstruction ne touche que cette
-- table de quelques lignes, jamais le journal des mouvements.
--
-- Le USING convertit via le texte : necessaire parce que l'ancien et le nouveau
-- type sont differents. Aucune valeur "RESERVATION" ne subsiste a ce stade (la
-- ligne de reference a ete supprimee juste avant), la conversion ne peut donc
-- pas echouer.
CREATE TYPE "MoveTypeCode_sans_reservation" AS ENUM (
  'ENTREE', 'SORTIE', 'TRANSFERT', 'PERTE', 'AJUSTEMENT', 'RETOUR'
);

ALTER TABLE "MoveType"
  ALTER COLUMN "code" TYPE "MoveTypeCode_sans_reservation"
  USING "code"::text::"MoveTypeCode_sans_reservation";

DROP TYPE "MoveTypeCode";

ALTER TYPE "MoveTypeCode_sans_reservation" RENAME TO "MoveTypeCode";