-- D20 : la reservation devient une promesse, plus une sortie de stock.
--
-- ETAPE 1 sur 3, etape critique : le nettoyage des DONNEES avant tout changement
-- de declaration.
--
-- Suppression des mouvements de type RESERVATION. Ils ne seront plus produits :
-- une reservation ne cree plus de mouvement avant sa validation.
--
-- Deux garde-fous explicites, pour qu'aucune quantite physiquement bloquee ne
-- disparaisse du journal :
--
--   * `reservation_id IS NOT NULL` : on ne touche qu'a des mouvements issus
--     d'une reservation. Un mouvement saisi manuellement ne peut pas etre
--     concerne, meme s'il portait (par anomalie) ce type.
--   * `status <> 'ACTIF'` : on ne supprime que des mouvements deja annules,
--     c'est-a-dire dont la quantite ne compte deja plus dans le stock. La
--     verification prealable a montre qu'il n'existe aujourd'hui AUCUNE
--     reservation ACTIF, donc aucune quantite reellement bloquee n'est en jeu.
--
-- La valeur d'enumeration RESERVATION sera retiree de `MoveTypeCode` dans une
-- migration ulterieure (20261003100400_drop_reservation_enum_value), une fois ce
-- nettoyage effectue : PostgreSQL ne permet ni de retirer une valeur d'enum ni de
-- la supprimer tant que des lignes l'utilisent.
DELETE FROM "moves"
 WHERE "reservation_id" IS NOT NULL
   AND "status" <> 'ACTIF';