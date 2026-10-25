-- Row required by application (createMovementTx looks up MoveType by code).
-- INVENTAIRE is always positive (sens = 1): it only adds stock.
INSERT INTO "MoveType" ("code", "label", "sens")
VALUES ('INVENTAIRE', 'Inventaire', 1)
ON CONFLICT ("code") DO NOTHING;