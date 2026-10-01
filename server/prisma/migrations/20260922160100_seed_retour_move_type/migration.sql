-- Row required by application (createMovementTx looks up MoveType by code).
INSERT INTO "MoveType" ("code", "label", "sens")
VALUES ('RETOUR', 'Retour', 1)
ON CONFLICT ("code") DO NOTHING;