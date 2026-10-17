-- An accepted offer has somewhere to go.
--
-- Accepting an offer reserved the listing and created nothing else, and
-- createDeal priced every deal from the listing's asking price. So the
-- agreed price could never reach an order — and since createDeal also
-- refused a RESERVED listing, the buyer whose offer was accepted could not
-- open the deal at all, and nothing could put the listing back on sale.
--
-- The deal now records the offer it came from and takes that offer's
-- amount as its price. Unique, so one accepted offer opens one deal.
-- Nullable: most deals are at the asking price, with no offer behind them.

ALTER TABLE "Order" ADD COLUMN "offerId" TEXT;
CREATE UNIQUE INDEX "Order_offerId_key" ON "Order"("offerId");
ALTER TABLE "Order" ADD CONSTRAINT "Order_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
