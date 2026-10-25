-- Until 2026-10-24 opening a deal reserved the listing; since then only a
-- payment, or an offer the seller accepted, does. Listings reserved by an
-- unpaid deal from before are reserved by nobody, so they show as Reserved
-- and their own buyer's payment was refused as "another buyer paid first"
-- (the owner, 2026-10-26). Each goes back on sale, unless a running deal
-- has been paid for or came from an accepted offer, or an accepted offer is
-- still inside its payment window. No schema change; one statement.
UPDATE "Listing" AS l
SET "status" = 'LIVE'
WHERE l."status" = 'RESERVED'
  AND NOT EXISTS (
    SELECT 1 FROM "Order" AS o
    WHERE o."listingId" = l."id"
      AND o."status" NOT IN ('COMPLETED', 'PAYMENT_EXPIRED', 'CANCELLED', 'RETURNED_TO_SELLER', 'REFUNDED')
      AND (o."paymentRef" IS NOT NULL OR o."offerId" IS NOT NULL)
  )
  AND NOT EXISTS (
    SELECT 1 FROM "Offer" AS f
    WHERE f."listingId" = l."id"
      AND f."status" = 'ACCEPTED'
      AND f."respondedAt" >= now() - make_interval(hours => COALESCE(
        (SELECT s."paymentWindowHours" FROM "PlatformSettings" AS s WHERE s."id" = 'singleton'),
        48
      ))
      AND NOT EXISTS (SELECT 1 FROM "Order" AS fo WHERE fo."offerId" = f."id")
  );
