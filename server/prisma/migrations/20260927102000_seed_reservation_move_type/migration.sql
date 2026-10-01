-- Row required by application (createReservation looks up MoveType by code).
-- sens = -1 : une reservation retire le stock disponible, comme une sortie ou un pret.
INSERT INTO "MoveType" ("code", "label", "sens")
VALUES ('RESERVATION', 'Reservation', -1)
ON CONFLICT ("code") DO NOTHING;
