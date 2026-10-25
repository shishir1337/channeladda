-- One conversation per buyer and seller, not one per listing (the owner,
-- 2026-10-26). Step 1 of 3: the columns. Every message gets the listing it
-- is about; the old per-listing threads are merged in the next migration,
-- and the pair is made unique in the one after. Nothing is deleted here.

-- AlterTable: which listing each line is about. Nullable until the merge
-- has filled it in for every row; made required in step 3.
ALTER TABLE "Message" ADD COLUMN "listingId" TEXT;

-- CreateIndex
CREATE INDEX "Message_conversationId_listingId_createdAt_idx" ON "Message"("conversationId", "listingId", "createdAt");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: the old thread ids, so old links still open.
CREATE TABLE "ConversationAlias" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConversationAlias_conversationId_idx" ON "ConversationAlias"("conversationId");

-- AddForeignKey
ALTER TABLE "ConversationAlias" ADD CONSTRAINT "ConversationAlias_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The thread's own listing is legacy from here on: optional, and SET NULL
-- rather than CASCADE, so deleting one listing can never delete a whole
-- conversation between two people.
ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_listingId_fkey";
ALTER TABLE "Conversation" ALTER COLUMN "listingId" DROP NOT NULL;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DropIndex: one thread per buyer per listing no longer holds.
DROP INDEX "Conversation_listingId_buyerId_key";
