-- Counters need a direction.
--
-- A seller's counter is still an Offer on the same listing by the same buyer,
-- so without this there is no way to tell whose turn it is to respond.
ALTER TABLE "Offer" ADD COLUMN "bySeller" BOOLEAN NOT NULL DEFAULT false;

-- How long an offer stands. Another number that should not need a deploy.
ALTER TABLE "PlatformSettings" ADD COLUMN "offerExpiryHours" INTEGER NOT NULL DEFAULT 48;
