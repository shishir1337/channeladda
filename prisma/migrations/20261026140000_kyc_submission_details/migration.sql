-- Optional ID checks for the Verified badge (the owner, 2026-10-26).
-- Additive only: new columns, one NOT NULL dropped, new indexes. No data is
-- changed or removed.

-- Which ID a member sent.
CREATE TYPE "KycDocument" AS ENUM ('AADHAAR', 'PAN', 'PASSPORT', 'OTHER');

ALTER TABLE "KycSubmission" ADD COLUMN "documentType" "KycDocument";
ALTER TABLE "KycSubmission" ADD COLUMN "documentBackUrl" TEXT;
ALTER TABLE "KycSubmission" ADD COLUMN "documentHash" TEXT;
ALTER TABLE "KycSubmission" ADD COLUMN "videoUrl" TEXT;
ALTER TABLE "KycSubmission" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 1;

-- The selfie video replaces a still selfie, so this is no longer required.
ALTER TABLE "KycSubmission" ALTER COLUMN "selfieUrl" DROP NOT NULL;

-- The review queue, oldest first, and the same-document warning.
CREATE INDEX "KycSubmission_status_submittedAt_idx" ON "KycSubmission"("status", "submittedAt");
CREATE INDEX "KycSubmission_documentHash_idx" ON "KycSubmission"("documentHash");
CREATE INDEX "User_kycDocHash_idx" ON "User"("kycDocHash");

-- The server's own hash of each upload, so an ID check never takes one from
-- the browser.
ALTER TABLE "Upload" ADD COLUMN "sha256" TEXT;
