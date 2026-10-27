-- Ajustement negatif : nature (PERTE, VOLE, CASSE) et motif libre.
-- Nullable : les ajustements positifs et les mouvements generes par la cloture
-- d'inventaire ne renseignent pas ces colonnes.
ALTER TABLE "moves" ADD COLUMN IF NOT EXISTS "adjust_nature" VARCHAR(20);
ALTER TABLE "moves" ADD COLUMN IF NOT EXISTS "adjust_motif" VARCHAR(255);
