-- One conversation per buyer and seller, step 3 of 3. The merge has left
-- one thread per pair and every line with its listing, so both rules can
-- be enforced. Either statement failing means the merge did not finish,
-- and nothing here is half-applied.

-- CreateIndex: one thread per buyer and seller. The direction counts: the
-- seller buying from the buyer later is a second thread.
CREATE UNIQUE INDEX "Conversation_buyerId_sellerId_key" ON "Conversation"("buyerId", "sellerId");

-- Every line is about exactly one listing.
ALTER TABLE "Message" ALTER COLUMN "listingId" SET NOT NULL;
