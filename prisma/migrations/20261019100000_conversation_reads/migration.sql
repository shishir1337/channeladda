-- Each reader keeps their own place in a conversation. A flag on each
-- message ("read by the other side") only worked with two readers; with the
-- deal's agent in the thread there are three.

-- CreateTable
CREATE TABLE "ConversationRead" (
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationRead_pkey" PRIMARY KEY ("conversationId","userId")
);

-- Backfill from the old flags, so nothing already read turns unread: each
-- side has read up to the newest message from the other side that was
-- marked read. A side that never read anything gets no marker, which reads
-- as everything unread — as it was.
INSERT INTO "ConversationRead" ("conversationId", "userId", "readAt")
SELECT c."id", c."buyerId", MAX(m."createdAt")
FROM "Conversation" AS c
JOIN "Message" AS m ON m."conversationId" = c."id"
WHERE m."readAt" IS NOT NULL
  AND m."senderId" IS DISTINCT FROM c."buyerId"
GROUP BY c."id", c."buyerId";

INSERT INTO "ConversationRead" ("conversationId", "userId", "readAt")
SELECT c."id", c."sellerId", MAX(m."createdAt")
FROM "Conversation" AS c
JOIN "Message" AS m ON m."conversationId" = c."id"
WHERE m."readAt" IS NOT NULL
  AND m."senderId" IS DISTINCT FROM c."sellerId"
GROUP BY c."id", c."sellerId";

-- AlterTable
ALTER TABLE "Message" DROP COLUMN "readAt";

-- CreateIndex
CREATE INDEX "ConversationRead_userId_idx" ON "ConversationRead"("userId");

-- AddForeignKey
ALTER TABLE "ConversationRead" ADD CONSTRAINT "ConversationRead_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationRead" ADD CONSTRAINT "ConversationRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
