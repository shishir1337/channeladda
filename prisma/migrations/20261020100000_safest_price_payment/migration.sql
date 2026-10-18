-- A Safest buyer now pays the channel price to Channel Adda after custody and
-- inspection, as a second payment on the same deal. Its invoices are marked
-- apart from the opening fee's, so neither can be mistaken for the other.
ALTER TYPE "InvoicePurpose" ADD VALUE 'DEAL_PRICE';
