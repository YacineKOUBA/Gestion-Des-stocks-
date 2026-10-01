-- AlterTable
ALTER TABLE "inventory_lines" ADD COLUMN     "locationId" INTEGER;

-- AddForeignKey
ALTER TABLE "moves" ADD CONSTRAINT "moves_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
