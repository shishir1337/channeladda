-- Reviews after a completed deal (2026-10-24): the buyer rates the seller
-- (the existing Review table), then buyer and seller each rate Channel Adda.
-- And the Google review link they are offered after a good rating.
CREATE TABLE "PlatformReview" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "body" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformReview_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlatformReview_orderId_authorId_key" ON "PlatformReview"("orderId", "authorId");
CREATE INDEX "PlatformReview_createdAt_idx" ON "PlatformReview"("createdAt");
ALTER TABLE "PlatformReview" ADD CONSTRAINT "PlatformReview_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlatformReview" ADD CONSTRAINT "PlatformReview_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PlatformSettings" ADD COLUMN "googleReviewUrl" TEXT;
