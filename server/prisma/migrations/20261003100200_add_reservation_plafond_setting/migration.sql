-- D20, regle 1 : plafond de reservation.
--
-- Regle du directeur : on peut reserver au maximum 15 % de la quantite globale de
-- chaque produit. Le plafond porte sur le CUMUL des reservations ACTIF d'un article,
-- pas sur chaque reservation isolement : sans cumul, cinq reservations successives
-- immobiliseraient 100 % du stock et la regle ne protegerait rien.
--
-- Valeur en pourcentage entier (15 = 15 %), comme `COEF_ALERTE` qui stocke 1.05.
-- Stockee en table `settings` et non en dur dans le code : le directeur l'a
-- presentee comme un regle de gestion, elle doit donc pouvoir etre ajustee depuis
-- l'ecran Parametres sans redemarrage.

INSERT INTO "settings" ("code", "value", "label")
VALUES ('RESERVATION_PLAFOND_PCT', '15', 'Réservation : plafond maximal par produit (%)')
ON CONFLICT ("code") DO NOTHING;