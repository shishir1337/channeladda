-- Safest stops sending the buyer to pay the seller directly: from here on the
-- price is paid to Channel Adda after custody, and everything a buyer pays is
-- held until it is earned. A Safest deal still running under the old steps
-- cannot finish under the new ones, and nothing is live yet — every such deal
-- is test data — so they are closed here rather than carried as a second flow.

-- The deals this closes, fixed before anything changes them.
CREATE TEMP TABLE "_closing" AS
SELECT o."id", o."buyerId", o."listingId", o."custodyAt",
       COALESCE((SELECT SUM(l."amountUsd")
                 FROM "LedgerEntry" AS l
                 WHERE l."orderId" = o."id" AND l."userId" IS NULL), 0) AS "held"
FROM "Order" AS o
WHERE o."mode" = 'SAFEST'
  AND o."status" IN ('AWAITING_PAYMENT', 'AWAITING_CUSTODY', 'IN_CUSTODY',
                     'AWAITING_BUYER_PAYMENT', 'AWAITING_HANDOVER', 'DISPUTED');

-- Whatever the platform holds for each of them — the admin fee at most — goes
-- back to the buyer's balance. Both halves, so the platform's own position on
-- the order nets to zero.
INSERT INTO "LedgerEntry" ("id", "userId", "orderId", "kind", "amountUsd", "note")
SELECT 'mig_' || md5(random()::text || c."id" || 'platform'), NULL, c."id",
       'REFUND'::"LedgerKind", -c."held",
       'Closed when Safest moved to on-platform payment'
FROM "_closing" AS c
WHERE c."held" > 0
UNION ALL
SELECT 'mig_' || md5(random()::text || c."id" || 'buyer'), c."buyerId", c."id",
       'REFUND'::"LedgerKind", c."held",
       'Closed when Safest moved to on-platform payment'
FROM "_closing" AS c
WHERE c."held" > 0;

-- A deal whose agent already took custody cannot be cancelled — the channel
-- has to go back — so those end as returned to the seller.
UPDATE "Order" AS o
SET "status" = (CASE WHEN c."custodyAt" IS NULL THEN 'CANCELLED'
                     ELSE 'RETURNED_TO_SELLER' END)::"OrderStatus",
    "cancelledAt" = now(),
    "updatedAt" = now()
FROM "_closing" AS c
WHERE o."id" = c."id";

UPDATE "Listing" AS li
SET "status" = 'LIVE', "updatedAt" = now()
FROM "_closing" AS c
WHERE li."id" = c."listingId" AND li."status" = 'RESERVED';

-- Under the new rule a fee is held when it is paid and only becomes income
-- when it is earned. A fee that was later refunded was never income, so the
-- row that booked it as such becomes the hold it really was — otherwise the
-- money desk, now counting Safest holds, would read every such deal as money
-- owed to buyers and subtract the refund from the month's revenue.
UPDATE "LedgerEntry" AS l
SET "kind" = 'ESCROW_HOLD'::"LedgerKind"
FROM "Order" AS o
WHERE l."orderId" = o."id"
  AND l."userId" IS NULL
  AND l."kind" = 'BUYER_FEE'
  AND o."mode" = 'SAFEST'
  AND o."status" <> 'COMPLETED'
  AND EXISTS (SELECT 1 FROM "LedgerEntry" AS r
              WHERE r."orderId" = o."id" AND r."userId" IS NULL
                AND r."kind" = 'REFUND');

DROP TABLE "_closing";
