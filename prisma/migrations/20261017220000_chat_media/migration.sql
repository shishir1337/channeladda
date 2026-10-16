-- Chat attachments, and the clocks that remove them.
--
-- A marketplace chat fills up with screenshots of dashboards, payout pages
-- and sometimes identity documents. Keeping those indefinitely turns a
-- support tool into a breach waiting to happen, so every attachment carries
-- its own expiry from the moment it is uploaded.
--
-- The expiry is stored rather than derived: changing the policy later must
-- not retroactively destroy what people have already sent.

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'VIDEO');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "attachmentBytes" INTEGER,
ADD COLUMN     "attachmentExpiresAt" TIMESTAMP(3),
ADD COLUMN     "attachmentKind" "MediaKind",
ADD COLUMN     "attachmentRemovedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Message_attachmentExpiresAt_idx" ON "Message"("attachmentExpiresAt");

-- CreateIndex
CREATE INDEX "Message_createdAt_idx" ON "Message"("createdAt");

