-- Prix unitaire propre a chaque lot (n'affecte pas le prix de l'article ni les autres lots).
ALTER TABLE "lots" ADD COLUMN "unit_price" DECIMAL(14,4);