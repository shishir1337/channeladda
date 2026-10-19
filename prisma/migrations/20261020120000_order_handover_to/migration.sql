-- The buyer's own account that receives ownership, named before they pay.
-- Nullable: deals opened before this have none, and the person transferring
-- reads it from the chat as they did before.
ALTER TABLE "Order" ADD COLUMN "handoverTo" TEXT;
