-- CreateIndex
CREATE UNIQUE INDEX "inventory_lines_movementId_key" ON "inventory_lines"("movementId");

-- AddForeignKey
ALTER TABLE "moves" ADD CONSTRAINT "moves_depot_dest_id_fkey" FOREIGN KEY ("depot_dest_id") REFERENCES "Depot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moves" ADD CONSTRAINT "moves_location_dest_id_fkey" FOREIGN KEY ("location_dest_id") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_lines" ADD CONSTRAINT "inventory_lines_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "moves"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bons" ADD CONSTRAINT "bons_depot_dest_id_fkey" FOREIGN KEY ("depot_dest_id") REFERENCES "Depot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
