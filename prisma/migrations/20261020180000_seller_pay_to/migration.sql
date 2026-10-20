-- A Safest buyer pays the seller directly, and the chat removes the bKash
-- numbers and bank details that payment needs. The seller says where to be
-- paid on the deal instead.
ALTER TABLE "Order" ADD COLUMN "sellerPayTo" TEXT,
ADD COLUMN "sellerPayToAt" TIMESTAMP(3),
ADD COLUMN "sellerPayToChangedAt" TIMESTAMP(3);
