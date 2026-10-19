-- A Safest buyer pays the seller directly again, once our agent holds the
-- channel, and the seller presses Received when the money arrives. That
-- moment is what lets our agent hand the channel to the buyer, and what
-- stops it ever going back to the seller.
ALTER TABLE "Order" ADD COLUMN "sellerConfirmedAt" TIMESTAMP(3);
