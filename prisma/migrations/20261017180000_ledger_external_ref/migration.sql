-- A unique handle for money arriving from outside.
--
-- Deposits are credited from a payment processor's callback, and processors
-- retry. Idempotency cannot hang off `note`, because internal notes repeat by
-- design ("Sale released to seller" is the same string on every Fastest deal),
-- so a unique index there would reject legitimate rows.
--
-- Nullable and unique: Postgres treats each NULL as distinct, so every
-- internal movement is unconstrained while every external one is claimed
-- exactly once.
ALTER TABLE "LedgerEntry" ADD COLUMN "externalRef" TEXT;

CREATE UNIQUE INDEX "LedgerEntry_externalRef_key" ON "LedgerEntry"("externalRef");
