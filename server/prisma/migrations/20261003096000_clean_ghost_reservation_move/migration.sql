-- D20 : suppression du mouvement de blocage fantome.
--
-- Constat, verifie en base avant ecriture :
--   le mouvement 946 (article 209, 1 unite, sens -1, type RESERVATION) est encore
--   ACTIF alors que sa reservation RSV-2026-0005 est ANNULE.
--
-- Consequence mesuree : cet article affiche 2036 unites au lieu de 2037. Le
-- blocage fantome retire du stock une unite qu'aucune reservation active ne
-- retient.
--
-- Pourquoi ce mouvement subsiste : `closeAsCancelled` fait passer les mouvements
-- a ANNULE via un `updateMany` filtre sur `reservationId`. La condition n'a pas
-- porte sur cette ligne. Cause exacte non encore isolee - elle est distinctive
-- de l'ecrasement de `status` a l'ecriture des reservations, pas de la
-- reservation elle-meme.
--
-- La migration 20261003095000 avait volontairement protege ce mouvement en
-- exigeant `status <> 'ACTIF'`. Cette protection est ici levee, sur une condition
-- qui porte sur la RESERVATION et non sur le mouvement : on ne supprime que des
-- mouvements dont la reservation n'est plus active. Aucune quantite reellement
-- promise a un acteur n'est retiree, par construction.
--
-- L'invariant de non-regression est verifie apres coup : l'article 209 doit
-- repasser de 2036 a 2037 unites.
DELETE FROM "moves" m
 USING "reservations" r
 WHERE m."reservation_id" = r.id
   AND r."status" <> 'ACTIF';