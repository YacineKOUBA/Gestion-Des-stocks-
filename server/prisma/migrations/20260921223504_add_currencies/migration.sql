-- AlterTable
ALTER TABLE "articles" ADD COLUMN     "currency" VARCHAR(3) NOT NULL DEFAULT 'DZD';

-- AlterTable
ALTER TABLE "bons" ADD COLUMN     "currency" VARCHAR(3) NOT NULL DEFAULT 'DZD';

-- AlterTable
ALTER TABLE "moves" ADD COLUMN     "currency" VARCHAR(3) NOT NULL DEFAULT 'DZD';

-- AlterTable
ALTER TABLE "price_history" ADD COLUMN     "currency" VARCHAR(3) NOT NULL DEFAULT 'DZD';
