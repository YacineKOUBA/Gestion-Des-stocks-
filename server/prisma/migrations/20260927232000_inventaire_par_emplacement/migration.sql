-- L'inventaire doit porter le stock au bon emplacement : l'unicite et la cle
-- etrangere doivent donc inclure l'emplacement, sinon deux lignes du meme lot
-- dans deux emplacements differents du meme depot sont impossibles, et l'ecart
-- valide est impute au mauvais emplacement (refus "stock insuffisant" a tort).

-- DropIndex
DROP INDEX "inventory_lines_inventoryId_articleId_lotId_key";

-- CreateIndex
CREATE UNIQUE INDEX "inventory_lines_inventoryId_articleId_lotId_locationId_key" ON "inventory_lines"("inventoryId", "articleId", "lotId", "locationId");

-- AddForeignKey
ALTER TABLE "inventory_lines" ADD CONSTRAINT "inventory_lines_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
