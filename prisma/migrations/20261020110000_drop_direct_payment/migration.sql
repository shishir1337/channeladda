-- No money moves between a buyer and a seller any more: a Safest buyer pays
-- the price to Channel Adda, so there is no seller payment address to show
-- and no seller "the money arrived" to record.
ALTER TABLE "Order" DROP COLUMN "sellerPayTo",
DROP COLUMN "sellerPayToAt",
DROP COLUMN "sellerPayToChangedAt",
DROP COLUMN "sellerConfirmedAt";
