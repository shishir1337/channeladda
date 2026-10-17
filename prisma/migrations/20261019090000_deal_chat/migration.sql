-- Deal chat: a conversation holds every deal opened in it, and a message can
-- be an offer card or a line of deal history as well as text.

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('TEXT', 'OFFER', 'EVENT');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "kind" "MessageKind" NOT NULL DEFAULT 'TEXT',
ADD COLUMN     "offerId" TEXT,
ADD COLUMN     "orderId" TEXT,
ALTER COLUMN "senderId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "conversationId" TEXT,
ADD COLUMN     "sellerPayTo" TEXT,
ADD COLUMN     "sellerPayToAt" TIMESTAMP(3),
ADD COLUMN     "sellerPayToChangedAt" TIMESTAMP(3);

-- Backfill: the link moves from the conversation to the deal. First the one
-- deal each conversation pointed at, then every other deal by the same buyer
-- on the same listing — the deals the old one-slot link could never hold.
UPDATE "Order" AS o
SET "conversationId" = c."id"
FROM "Conversation" AS c
WHERE c."orderId" = o."id";

UPDATE "Order" AS o
SET "conversationId" = c."id"
FROM "Conversation" AS c
WHERE o."conversationId" IS NULL
  AND c."listingId" = o."listingId"
  AND c."buyerId" = o."buyerId";

-- DropForeignKey
ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_orderId_fkey";

-- DropIndex
DROP INDEX "Conversation_orderId_key";

-- AlterTable
ALTER TABLE "Conversation" DROP COLUMN "orderId";

-- CreateIndex
CREATE INDEX "Message_offerId_idx" ON "Message"("offerId");

-- CreateIndex
CREATE INDEX "Message_orderId_idx" ON "Message"("orderId");

-- CreateIndex
CREATE INDEX "Order_conversationId_idx" ON "Order"("conversationId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
