-- The Escrow Agent: a member's own chat with Channel Adda's live agents,
-- pinned at the top of Messages (the owner, 2026-10-26). New tables only:
-- Conversation and Message are untouched, so every existing chat query
-- works the same before and after this runs.
-- CreateTable
CREATE TABLE "SupportThread" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "awaitingSince" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "memberReadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "fromAgent" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "attachmentUrl" TEXT,
    "attachmentKind" "MediaKind",
    "attachmentBytes" INTEGER,
    "attachmentExpiresAt" TIMESTAMP(3),
    "attachmentRemovedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportThread_memberId_key" ON "SupportThread"("memberId");

-- CreateIndex
CREATE INDEX "SupportThread_awaitingSince_idx" ON "SupportThread"("awaitingSince");

-- CreateIndex
CREATE INDEX "SupportThread_lastMessageAt_idx" ON "SupportThread"("lastMessageAt");

-- CreateIndex
CREATE INDEX "SupportMessage_threadId_createdAt_idx" ON "SupportMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportMessage_attachmentExpiresAt_idx" ON "SupportMessage"("attachmentExpiresAt");

-- CreateIndex
CREATE INDEX "SupportMessage_attachmentUrl_idx" ON "SupportMessage"("attachmentUrl");

-- AddForeignKey
ALTER TABLE "SupportThread" ADD CONSTRAINT "SupportThread_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "SupportThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

