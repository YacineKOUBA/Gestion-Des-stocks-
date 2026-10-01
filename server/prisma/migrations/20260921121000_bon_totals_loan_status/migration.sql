-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('OUVERT', 'PARTIEL', 'CLOTURE');

-- AlterEnum column (preserve existing values via USING)
ALTER TABLE "loans" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "loans" ALTER COLUMN "status" TYPE "LoanStatus" USING ("status"::text::"LoanStatus");
ALTER TABLE "loans" ALTER COLUMN "status" SET DEFAULT 'OUVERT';

-- AlterTable bon_lines : prix unitaire et montant de ligne
ALTER TABLE "bon_lines" ADD COLUMN     "montant" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "unit_price" DECIMAL(14,4);

-- AlterTable bons : montant total
ALTER TABLE "bons" ADD COLUMN     "montant_total" DECIMAL(18,4) NOT NULL DEFAULT 0;
