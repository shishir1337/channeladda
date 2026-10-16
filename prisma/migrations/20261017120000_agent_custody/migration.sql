-- Agent custody and the two deal modes.
--
-- Hand-adjusted from `prisma migrate diff`, which wanted to drop and recreate
-- `Order.mode` and drop `PlatformSettings.buyerFeeBp` outright. Both carry live
-- values in development, so the data is mapped across instead.

-- CreateEnum
CREATE TYPE "DealMode" AS ENUM ('SAFEST', 'FASTEST');

-- AlterEnum
ALTER TYPE "LedgerKind" ADD VALUE 'DEPOSIT';

-- AlterEnum
-- The four removed values (IN_ESCROW, TRANSFERRING, BUYER_CHECKING,
-- COOLING_OFF) described a single-escrow flow that no longer exists. Verified
-- unused before writing this: every existing order is COMPLETED.
BEGIN;
CREATE TYPE "OrderStatus_new" AS ENUM ('AWAITING_PAYMENT', 'AGENT_VERIFYING', 'AWAITING_CUSTODY', 'IN_CUSTODY', 'AWAITING_BUYER_PAYMENT', 'AWAITING_HANDOVER', 'AWAITING_RELEASE', 'COMPLETED', 'PAYMENT_EXPIRED', 'CANCELLED', 'RETURNED_TO_SELLER', 'REFUNDED', 'DISPUTED');
ALTER TABLE "public"."Order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Order" ALTER COLUMN "status" TYPE "OrderStatus_new" USING ("status"::text::"OrderStatus_new");
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
DROP TYPE "public"."OrderStatus_old";
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'AWAITING_PAYMENT';
COMMIT;

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'AGENT';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "agentBrand" TEXT,
ADD COLUMN     "agentEmail" TEXT,
ADD COLUMN     "agentId" TEXT,
ADD COLUMN     "buyerPaidAt" TIMESTAMP(3),
ADD COLUMN     "buyerPaymentRef" TEXT,
ADD COLUMN     "custodyAt" TIMESTAMP(3),
ADD COLUMN     "feePaidAt" TIMESTAMP(3),
ADD COLUMN     "handoverAt" TIMESTAMP(3),
ADD COLUMN     "sellerConfirmedAt" TIMESTAMP(3);

-- Map the old CheckoutMode onto DealMode rather than dropping the column.
-- ESCROW was the full supervised handover, which is what Safest is now; QUICK
-- was the credentials-on-payment path, closest to Fastest.
ALTER TABLE "Order" ADD COLUMN "mode_new" "DealMode";
UPDATE "Order" SET "mode_new" = CASE "mode"::text
  WHEN 'ESCROW' THEN 'SAFEST'::"DealMode"
  WHEN 'QUICK' THEN 'FASTEST'::"DealMode"
END;
ALTER TABLE "Order" ALTER COLUMN "mode_new" SET NOT NULL;
ALTER TABLE "Order" DROP COLUMN "mode";
ALTER TABLE "Order" RENAME COLUMN "mode_new" TO "mode";
ALTER TABLE "Order" ALTER COLUMN "mode" SET DEFAULT 'SAFEST';

-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "buyerFeeBpFastest" INTEGER NOT NULL DEFAULT 300,
ADD COLUMN     "buyerFeeBpSafest" INTEGER NOT NULL DEFAULT 300,
ADD COLUMN     "maxHoldsPerAgent" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "secondApprovalAboveUsd" INTEGER NOT NULL DEFAULT 500000,
ALTER COLUMN "sellerFeeBp" SET DEFAULT 0;

-- Carry the single configured buyer rate onto both modes, so an owner who had
-- changed it from 3% does not silently get 3% back.
UPDATE "PlatformSettings"
SET "buyerFeeBpSafest" = "buyerFeeBp", "buyerFeeBpFastest" = "buyerFeeBp";

-- The seller fee now only applies to a Fastest deal, and the agreed model has
-- the seller receiving the whole price. The inherited 5% would start charging
-- sellers the moment the first Fastest deal completed, so it is reset here
-- rather than left to be noticed later.
UPDATE "PlatformSettings" SET "sellerFeeBp" = 0;

ALTER TABLE "PlatformSettings" DROP COLUMN "buyerFeeBp",
DROP COLUMN "escrowRequiredAboveUsd";

-- AlterTable
ALTER TABLE "TransferStep" ADD COLUMN     "approvedById" TEXT;

-- DropEnum
DROP TYPE "CheckoutMode";

-- CreateIndex
CREATE INDEX "AuditLog_entity_createdAt_idx" ON "AuditLog"("entity", "createdAt");

-- CreateIndex
CREATE INDEX "Order_agentId_status_idx" ON "Order"("agentId", "status");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferStep" ADD CONSTRAINT "TransferStep_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
