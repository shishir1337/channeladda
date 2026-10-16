-- A record of every file we store, and who stored it.
--
-- The serving route now gates proof screenshots and chat attachments, and
-- without this a person could not read their own upload until something
-- else referenced it -- so every preview in a half-finished form broke.
--
-- It also makes orphan collection possible. An upload never attached to
-- anything was never deleted, which let any signed-in account fill the disk
-- through the upload endpoint alone.

-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "contentType" TEXT NOT NULL,
    "attachedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Upload_key_key" ON "Upload"("key");

-- CreateIndex
CREATE INDEX "Upload_uploaderId_idx" ON "Upload"("uploaderId");

-- CreateIndex
CREATE INDEX "Upload_attachedAt_createdAt_idx" ON "Upload"("attachedAt", "createdAt");

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

