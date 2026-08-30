-- Human-readable URL key for listings. Search is the main acquisition
-- channel, so listings are addressed by slug rather than by opaque id.
ALTER TABLE "Listing" ADD COLUMN "slug" TEXT NOT NULL;

CREATE UNIQUE INDEX "Listing_slug_key" ON "Listing"("slug");
CREATE INDEX "Listing_slug_idx" ON "Listing"("slug");
