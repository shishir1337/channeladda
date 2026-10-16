-- What a seller pastes, and what we work out from it.
--
-- sourceUrl is the channel link; externalId is the platform's own id for
-- the account, which survives a rename where a handle does not. Both are
-- nullable: every existing listing was created by typing a handle.
--
-- yearlyRevenueUsd is stored rather than derived from the monthly figure,
-- because this trade is seasonal and twelve times a good month is a number
-- nobody believes.
--
-- whatsapp is staff-only. It is collected so a stalled transfer can be
-- unstuck by phoning the seller, and it is never rendered to a buyer: the
-- contact redaction in chat exists to stop deals leaving the platform, and
-- printing a number on the listing page would undo it.

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "description" TEXT,
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "sourceUrl" TEXT,
ADD COLUMN     "whatsapp" TEXT,
ADD COLUMN     "yearlyRevenueUsd" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Listing_platform_externalId_idx" ON "Listing"("platform", "externalId");

