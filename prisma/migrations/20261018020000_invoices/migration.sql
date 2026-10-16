-- A record of every invoice we raise.
--
-- Written at creation, which is the only moment we know for certain who an
-- invoice belongs to and what it was for.
--
-- Two defects made this necessary. A top-up callback recovered its payee
-- from an 8-character slice of the reference by scanning the user table,
-- which is both lossy and unindexed. And a callback whose handler threw left
-- no trace that money had been asked for, so nothing could reconcile it --
-- the webhook had already answered 200, the processor never re-delivered,
-- and the sweep then expired the deal with the buyer out of pocket.

-- CreateEnum
CREATE TYPE "InvoicePurpose" AS ENUM ('DEAL', 'TOPUP');

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "purpose" "InvoicePurpose" NOT NULL,
    "amountUsd" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT,
    "externalId" TEXT,
    "lastStatus" TEXT,
    "settledAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_reference_key" ON "Invoice"("reference");

-- CreateIndex
CREATE INDEX "Invoice_purpose_appliedAt_idx" ON "Invoice"("purpose", "appliedAt");

-- CreateIndex
CREATE INDEX "Invoice_userId_idx" ON "Invoice"("userId");

-- CreateIndex
CREATE INDEX "Invoice_orderId_idx" ON "Invoice"("orderId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

