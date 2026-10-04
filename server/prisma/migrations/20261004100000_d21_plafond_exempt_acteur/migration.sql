-- D21 : dispense du plafond cumulatif de reservation, accordee par la direction
-- generale a un acteur. La colonne porte la valeur par defaut false : aucun acteur
-- existant n'est change, la dispense reste une decision explicite.
ALTER TABLE "Partner" ADD COLUMN "plafond_exempt" BOOLEAN NOT NULL DEFAULT false;

-- Le libelle du parametre ne decrit plus la regle : le plafond porte desormais sur
-- le cumul des promesses d'un acteur, pas sur la reserve globale du produit. On garde
-- l'accentuation des autres libelles, qui est celle de l'interface.
UPDATE settings
SET label = 'Réservation : plafond cumulé maximal par produit et par acteur (%)'
WHERE code = 'RESERVATION_PLAFOND_PCT';