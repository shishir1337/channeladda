-- Editorial promotion flag. The other card badges (new, price drop, hot) are
-- derived from the row at read time rather than stored.
ALTER TABLE "Listing" ADD COLUMN "featured" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Listing_featured_idx" ON "Listing"("featured");
