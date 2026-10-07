-- D29 : code du conditionnement.
-- Le referentiel des conditionnements n'avait que `label`, alors que tous les
-- autres referentiels exposent un code (familles, unites, origines, depots...).
-- La direction a demande un code pour chaque conditionnement.
ALTER TABLE "Packaging" ADD COLUMN "code" VARCHAR(10);

-- Reprise sans perte : chaque ligne existante recoit son code, sur la convention
-- deja utilisee pour les familles (libelle en majuscules). Les libelles sont
-- uniques, donc les codes le sont aussi. server/scripts/seed-packaging.ts
-- verifie ensuite que les 7 conditionnements de l'onglet PRODUIT sont couverts.
UPDATE "Packaging" SET "code" = UPPER("label") WHERE "code" IS NULL;

ALTER TABLE "Packaging" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX "Packaging_code_key" ON "Packaging"("code");
