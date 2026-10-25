-- Safest ends in two steps now (the client, 2026-10-25): our agent invites
-- the buyer as owner, Google's 7-day wait runs, then our agent makes the
-- buyer primary owner. Steps are written when a deal opens, so every Safest
-- deal still running on the steps of 2026-10-20 is moved onto the new end:
-- its unfinished step 8 "Transfer ownership to the buyer" becomes "Invite
-- the buyer as owner", and step 9 is added. Steps 1 to 7 are the same in
-- both. Finished deals, and any whose step 8 is already done, are left as
-- they are. No schema change; one statement, so it can run on its own.
WITH moved AS (
  UPDATE "TransferStep" AS s
  SET "label" = 'Invite the buyer as owner'
  FROM "Order" AS o
  WHERE s."orderId" = o."id"
    AND o."mode" = 'SAFEST'
    AND o."status" NOT IN ('COMPLETED', 'PAYMENT_EXPIRED', 'CANCELLED', 'RETURNED_TO_SELLER', 'REFUNDED')
    AND s."position" = 8
    AND s."label" = 'Transfer ownership to the buyer'
    AND s."completedAt" IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM "TransferStep" AS later
      WHERE later."orderId" = s."orderId" AND later."position" = 9
    )
  RETURNING s."orderId"
)
INSERT INTO "TransferStep" ("id", "orderId", "position", "label", "actor")
SELECT 'step9_' || md5(moved."orderId"), moved."orderId", 9, 'Make the buyer primary owner', 'agent'
FROM moved;
