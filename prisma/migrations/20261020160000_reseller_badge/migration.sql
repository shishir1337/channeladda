-- Rating points and the Reseller badge (2026-10-20). Points are derived from
-- completed deals and need no column; the badge is bought 30 days at a time.
ALTER TYPE "LedgerKind" ADD VALUE 'BADGE_FEE';
ALTER TYPE "InvoicePurpose" ADD VALUE 'BADGE';

CREATE TYPE "PassPaidVia" AS ENUM ('BALANCE', 'CRYPTOMUS');

ALTER TABLE "PlatformSettings"
  ADD COLUMN "resellerPriceUsd" INTEGER NOT NULL DEFAULT 2000,
  ADD COLUMN "resellerDiscountBp" INTEGER NOT NULL DEFAULT 3000,
  ADD COLUMN "resellerPointsMultiplier" INTEGER NOT NULL DEFAULT 3;

CREATE TABLE "ResellerPass" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "amountUsd" INTEGER NOT NULL,
  "reference" TEXT NOT NULL,
  "paidVia" "PassPaidVia" NOT NULL,
  "remindedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResellerPass_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ResellerPass_reference_key" ON "ResellerPass"("reference");
CREATE INDEX "ResellerPass_userId_endsAt_idx" ON "ResellerPass"("userId", "endsAt");
ALTER TABLE "ResellerPass" ADD CONSTRAINT "ResellerPass_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
