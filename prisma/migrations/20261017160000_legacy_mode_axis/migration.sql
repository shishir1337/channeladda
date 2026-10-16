-- Corrects the mode mapped onto pre-existing orders by 20261017120000.
--
-- That migration mapped the old `CheckoutMode.ESCROW` onto `SAFEST` because
-- both were the heavily supervised option. That was the wrong axis. The old
-- ESCROW was the mode where **the platform held the money** — hence the old
-- `IN_ESCROW` and `COOLING_OFF ("funds still held")` statuses — and holding
-- the money is what `FASTEST` means now. `SAFEST` holds no money at all.
--
-- It also matters for the numbers. An old ESCROW order stored
-- `totalUsd = price + fee`, which is exactly what `FASTEST` still means;
-- under `SAFEST`, `totalUsd` means the fee alone, so `/admin/deals` was
-- rendering "buyer owes $10,300" for historic rows where the figure is now
-- supposed to be the fee.
--
-- The earlier migration cannot be edited: Prisma records a checksum and a
-- modified migration makes every later `migrate deploy` fail. So the rows are
-- corrected here instead.
--
-- Legacy rows are identified by `feePaidAt IS NULL` on a COMPLETED order.
-- Nothing but the removed seed script could have produced that combination:
-- every deal created by this codebase sets `feePaidAt` the moment its opening
-- payment clears, and a deal cannot reach COMPLETED without clearing one.

UPDATE "Order"
SET "mode" = 'FASTEST'
WHERE "status" = 'COMPLETED'
  AND "feePaidAt" IS NULL
  AND "mode" = 'SAFEST';
