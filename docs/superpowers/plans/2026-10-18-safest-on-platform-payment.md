# Safest on-platform payment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Safest buyer pays the price and fee to Channel Adda up front, by Cryptomus or from their balance. The price is held and released into the seller's Channel Adda wallet on completion. Nothing moves directly between buyer and seller.

**Architecture:** Safest adopts the escrow ledger Fastest already uses:

- `ESCROW_HOLD` on the opening payment;
- `ESCROW_RELEASE`, `BUYER_FEE` and `SELLER_FEE` on completion;
- `REFUND` when a deal is undone.

Every money move first checks that the platform's hold on the order equals its `totalUsd`.

The Safest template shrinks from nine steps to seven. The pay-the-seller steps and the "where to pay me" machinery are deleted. The seller's wallet gains "Held for your sales".

**Tech Stack:** Next.js 16, React 19 with the React Compiler, Prisma 7 on Postgres 16, Vitest, Biome.

**Spec:** `docs/superpowers/specs/2026-10-18-safest-on-platform-payment-design.md`. This plan assumes the spec's four recommended answers. Rewrite it if the owner chooses otherwise.

**Research:** `.superpowers/revamp/money-model-report.md` has file:line citations for every current money path, step dependency and copy line.

## Global Constraints

- **No money moves directly between a buyer and a seller.** Remove every path, field and sentence that suggests otherwise.
- **Fees:**
  - Safest `totalUsd = priceUsd + buyerFeeUsd`.
  - The Safest buyer fee rate stays `buyerFeeBpSafest`.
  - `sellerFeeBp` applies to both modes.
- **When the seller is paid:**
  - The seller's price becomes withdrawable only on `COMPLETED`.
  - There is no waiting period after a Safest completion.
- **Platform position on an order:**
  - Completed: buyer fee + seller fee.
  - Returned after custody: buyer fee.
  - Returned or cancelled before custody: 0.
- **Refunds:**
  - A paid Safest return or cancel is FINANCE or SUPERADMIN only.
  - The fee is kept once `custodyAt` is set. Otherwise everything is refunded.
- **Approvals:** Safest steps 6 and 7 both carry `needsApprovalAbove` (`secondApprovalAboveUsd`, default 500000 cents).
- **Retired status:** `AWAITING_BUYER_PAYMENT` stays in the Postgres enum and in every `Record<OrderStatus, …>` map, with "retired" wording. It is unreachable.
- **Migrations:**
  - Hand-written SQL in `prisma/migrations/`, named after `20261019100000_conversation_reads`.
  - Tables are `"Order"`, `"LedgerEntry"` and `"Listing"`.
  - `LedgerEntry.id` and every `updatedAt` have no database default, so set them explicitly.
  - Cast enum literals, for example `'REFUND'::"LedgerKind"`.
  - Apply only to `channeladda_test` and `channeladda_e2e` (`DATABASE_URL=<db> pnpm db:migrate`, then `pnpm -s prisma generate`). Never apply to `channeladda`.
- **Tests:**
  - Vitest refuses to run unless `DATABASE_URL_TEST` names a `_test` database.
  - Redirect full-suite output to a scratch file and read the tail.
- **Commits:**
  - Lint with `pnpm -s exec biome check .`.
  - Typecheck with `pnpm -s exec tsc --noEmit -p .`.
  - Run the React Compiler check (`node rc2.cjs <file>`, session scratchpad) on every changed client component. Expect zero bailouts.
  - Commit an explicit file list, ending with the session's attribution lines.
- **Secrets:** never print Cryptomus keys, the dev password or any API key.
- **Copy:**
  - Plain sentences that say what happens. No "seamless" and no exclamation marks.
  - Show money with the `Price` component.

## Review Focus

1. **Late payment.** A Safest payment that arrives after the deal was cancelled or returned is credited once, to the buyer's balance, at price + fee. Test: Task 3, `a late safest payment is credited once at the full amount`.
2. **Underpayment.** An invoice paid at or above the fee but below price + fee must not open the deal. Test: Task 2, `an underpaid safest invoice does not start the deal`.
3. **One payment, two names.** A payment recorded by hand and also applied by Cryptomus is credited once. Test: Task 3, `a payment recorded by hand is refused while a checkout invoice is open`.
4. **Withdrawing held money.** A seller trying to withdraw money that is still held is refused. Test: Task 6, `a held sale cannot be withdrawn`.
5. **Old history.** Old conversations with `pay-to-saved` events and old step labels render without throwing. Test: Task 5, `an old pay-to event is skipped, not rendered`.

---

### Task 1: Close the running Safest test deals and re-label refunded fees

This goes first so that no fee-only order ever meets the new completion code.

**Files:**
- Create: `prisma/migrations/20261020090000_close_old_safest_deals/migration.sql`

**Interfaces:**
- Produces: no running Safest order in any database the migration has run on.
  - Every old refunded fee sits under `ESCROW_HOLD`, never `BUYER_FEE`.
  - Every closed order's platform position is 0.

- [ ] **Step 1: Snapshot the e2e database's money**, so the migration can be checked against real old-flow data from the walkthrough. Save the output to the scratchpad.

  ```sql
  select status, count(*) from "Order" where mode='SAFEST' group by 1;
  select o.id, o.status, sum(l."amountUsd") from "Order" o join "LedgerEntry" l on l."orderId"=o.id and l."userId" is null where o.mode='SAFEST' group by 1,2;
  ```

- [ ] **Step 2: Write the migration** as one transaction. "Running" means Safest with status in `AWAITING_PAYMENT`, `AWAITING_CUSTODY`, `IN_CUSTODY`, `AWAITING_BUYER_PAYMENT`, `AWAITING_HANDOVER` or `DISPUTED`.
  1. **Refund what the platform holds.** For each running order, `held = coalesce(sum("amountUsd")) where "orderId"=o.id and "userId" is null`.
     - Where `held > 0`, insert two `REFUND` rows: platform −held, and buyer +held. Both get the note `Closed when Safest moved to on-platform payment` and id `'mig_' || md5(random()::text || o.id || side)`.
  2. **Close the order.** Set `status` to `'CANCELLED'` where `"custodyAt" is null`, else `'RETURNED_TO_SELLER'` (cast to `"OrderStatus"`). Set `"cancelledAt" = now()` and `"updatedAt" = now()`.
  3. **Free the listing.** Set those orders' listings to `'LIVE'` where they are `'RESERVED'`, with `"updatedAt" = now()`.
  4. **Re-label refunded fees.** Retag platform `BUYER_FEE` rows to `ESCROW_HOLD` on every Safest order whose status is not `COMPLETED` and which has a platform `REFUND` row.
  - Do not touch `TransferStep` rows.
- [ ] **Step 3: Apply it** to `channeladda_e2e` and `channeladda_test`.
  - Then re-run Step 1's queries on e2e. Expected:
    - no Safest order in a running status;
    - every closed order's platform sum is 0;
    - completed Safest orders are unchanged against the snapshot.
  - Then run `select count(*) from "LedgerEntry" l join "Order" o on o.id=l."orderId" where o.mode='SAFEST' and o.status<>'COMPLETED' and l.kind='BUYER_FEE' and exists (select 1 from "LedgerEntry" r where r."orderId"=o.id and r.kind='REFUND')`. Expected: 0.
- [ ] **Step 4: Run the whole suite.** Expected: green, since the test database is wiped per test.
- [ ] **Step 5: Commit** with the message "chore: running Safest test deals close before Safest moves its money on-platform".

### Task 2: Safest money goes through Channel Adda

**Files:**
- Modify:
  - `src/lib/fees.ts`: `orderAmounts`.
  - `src/server/deals.ts`:
    - the opening payment ledger rows in `recordOpeningPayment`;
    - `completeOrder`;
    - the cancel and return block of `resolveDeal`;
    - `movesPlatformMoney`;
    - a new `platformHoldFor`.
  - `src/server/wallet.ts`: the platform row in `payFromWallet`.
  - `src/server/dashboard.ts`: `getBuyerSummary`.
  - `src/server/admin-money.ts`:
    - `HELD_FOR_BUYERS`, `expectedHold`, and the mismatch query (rename it `holdMismatches`, and update its callers);
    - the month figures at `:234-265`. Fees net is the platform `BUYER_FEE` and `SELLER_FEE` rows; `REFUND` no longer reduces revenue; `paidIn` covers both modes.
  - `src/components/admin/vocab.tsx`: `custodyFacts` `platformHolds` is true for any paid deal.
  - `src/components/admin/deal-controls.tsx`: the "Finance only" badge at `:773-777` and the return's weight at `:503-506` follow `movesPlatformMoney`.
  - `src/server/actions/deals.ts`: a message for `books-mismatch`.
- Test:
  - `src/lib/fees.test.ts`
  - `src/server/deals.test.ts`
  - `src/server/wallet.test.ts`
  - `src/server/deal-flow.test.ts`
  - `src/server/deal-guards.test.ts`
  - `src/server/custody-safety.test.ts`: returns at `:134`, `:301`, `:329` and `:539` move to a FINANCE user.
  - `src/server/agent-thread-access.test.ts`
  - `src/server/review-fixes.test.ts`
  - `src/server/admin-money.test.ts`
  - `src/server/logic-fixes.test.ts`
  - `src/server/pay-attempts.test.ts`: the underpaid case goes through `reconcileInvoices`, with `@/server/cryptomus` mocked as this file already does.

**Interfaces:**
- Consumes: Task 1's clean data.
- Produces:
  - `orderAmounts(price, fees, mode)`: `totalUsd = price + buyerFee` and `sellerFeeUsd = applyBp(price, sellerFeeBp)` in both modes.
  - `platformHoldFor(tx, orderId): Promise<number>`: the sum of platform `ESCROW_HOLD`, `ESCROW_RELEASE` and `REFUND` rows on the order.
  - The new `DealFailure` reason `"books-mismatch"`, returned when that sum ≠ `order.totalUsd` at completion or refund.
  - `holdMismatches(): Promise<HoldMismatch[]>`, covering both modes.

- [ ] **Step 1: Write the failing tests.** Amounts are in cents, with a seeded price of 10_000 and a default buyer fee of 300 bp.
  - **fees.test:**
    - `a safest buyer owes the price and the fee`: total is 10_300.
    - `the seller fee applies to safest sales`: at `sellerFeeBp: 500`, the seller fee is 500 and the payout is 9_500.
    - Delete the two tests asserting the opposite.
  - **deals.test:** `a paid safest deal holds the price and the fee`. There is one platform row, `ESCROW_HOLD` +10_300, and no `BUYER_FEE`.
  - **wallet.test:** `paying a safest deal from the balance debits the price and the fee`. The buyer row is `ESCROW_HOLD` −10_300 and the platform row is +10_300.
  - **deal-flow.test:** `a safest deal pays the seller's wallet on completion` replaces `a safest deal runs end to end`.
    - `balanceOf(seller)` is 10_000.
    - `platformPositionFor` is 300.
    - With `sellerFeeBp: 500`, the seller gets 9_500 and the platform 800.
  - **deal-guards.test:**
    - `returning the channel before custody refunds the price and the fee`: the buyer gets +10_300 and the platform position is 0.
    - `returning the channel after custody refunds the price and keeps the fee`:
      - the buyer gets +10_000 and the platform position is 300;
      - there are platform rows `ESCROW_RELEASE` −300 and `BUYER_FEE` +300;
      - held-for-buyers on the order is 0.
    - `returning a paid safest deal needs finance`: a MODERATOR is refused with the existing finance-only reason.
    - `completion refuses an order whose hold does not match`: an order with `totalUsd` bumped by 1 after payment fails with `books-mismatch` and writes no row.
    - Delete `cancelling before the agent takes custody refunds the admin fee` and `a completed safest deal leaves the platform holding only its fee`.
  - **review-fixes.test:** `cancelling a wallet-paid safest deal returns the price and the fee to the wallet` (+10_300).
  - **pay-attempts.test:** `an underpaid safest invoice does not start the deal`. A settled invoice paying 300 of 10_300 leaves the order `AWAITING_PAYMENT` and writes no ledger row.
  - **admin-money.test:**
    - The books test: a completed Safest deal counts in held-for-buyers until release and nets to 0 after.
    - `returning a safest deal is not negative revenue`: after a return after custody, the month's fees net is 300.
    - `a safest hold that does not match its order is reported`.
  - **logic-fixes.test:** `a completed safest purchase counts what the buyer paid us`. Spent is 103 dollars (`totalUsd` 10_300 cents), with no added price.
- [ ] **Step 2: Run them.** `pnpm -s vitest run src/lib/fees.test.ts src/server/deals.test.ts src/server/wallet.test.ts src/server/deal-flow.test.ts src/server/deal-guards.test.ts src/server/review-fixes.test.ts src/server/pay-attempts.test.ts src/server/admin-money.test.ts src/server/logic-fixes.test.ts`
  - Expected: FAIL on the amounts and rows above.
- [ ] **Step 3: Implement.**
  - `orderAmounts`: no mode branches.
  - **Opening payment** (both paths): the platform row is `ESCROW_HOLD` +`totalUsd` in both modes.
  - **`completeOrder`:** drop the mode return. Throw `DealAbort("books-mismatch")` unless `platformHoldFor === totalUsd`.
  - **`resolveDeal`:**
    - Run the same check before any refund.
    - On Safest, the paid refund is `custodyAt ? priceUsd : totalUsd`, for both `CANCELLED` and `RETURNED_TO_SELLER`.
    - When the fee is kept, add platform `ESCROW_RELEASE` −fee and `BUYER_FEE` +fee.
  - **`movesPlatformMoney`:** true for `RETURNED_TO_SELLER` and `CANCELLED` when `paymentRef` is set.
  - **`getBuyerSummary`:** drop the Safest price addition and its comment.
  - **Comments:** rewrite every comment that says Safest never holds the price (`fees.ts`, `deals.ts`, `deal-machine.ts`, `schema.prisma`; lines are in the research).
- [ ] **Step 4: Run Step 2's command.**
  - Then run `custody-safety.test.ts` and `agent-thread-access.test.ts`.
  - Then the whole suite. Fix every other fee-only Safest expectation: `deal-feed.test`, `admin-disputes.test`, `deal-events.test`, `e2e-lifecycle.test` and `money-safety.test`.
  - Expected: green.
- [ ] **Step 5: Commit** with the message "feat: a Safest buyer pays Channel Adda the price and fee up front, and the seller is paid on completion".

### Task 3: One payment is credited once

**Files:**
- Modify:
  - `src/server/deals.ts`: `recordManualPayment`, `creditUnusablePayment` and `resolveDeal`.
  - `src/server/actions/deals.ts`: `markOpeningPaymentReceived` messages.
- Test: `src/server/money-safety.test.ts`

**Interfaces:**
- Produces two new manual-record refusals:
  - `"invoice-open"`: a DEAL invoice for the order exists that is neither applied as dead nor refunded;
  - `"already-paid"`: `paymentRef` is set.
- Produces: `resolveDeal` writes only the platform side, with the note "Refunded by the processor", when an audit row `payment.refunded_by_processor` exists for the order.

- [ ] **Step 1: Write the failing tests.**
  - `a payment recorded by hand is refused while a checkout invoice is open`.
  - `a payment recorded by hand on a paid deal is refused`. Assert that no `DEPOSIT` row is written.
  - `a late safest payment is credited once at the full amount`:
    - `recordOpeningPayment` on a `CANCELLED` order under the invoice reference credits `DEPOSIT` +10_300;
    - a second call under `order.reference` credits nothing.
  - `a deal refunded by the processor is not refunded again to the balance`: after the processor-refund freeze, a finance return writes the platform −held row and no buyer row.
- [ ] **Step 2: Run them.** `pnpm -s vitest run src/server/money-safety.test.ts`
  - Expected: FAIL.
- [ ] **Step 3: Implement.** `creditUnusablePayment` credits a name only once per order. If a `late:` row already exists for the order, it credits nothing.
- [ ] **Step 4: Run Step 2's command and the whole suite.**
  - Expected: green.
- [ ] **Step 5: Commit** with the message "fix: one payment is credited once, however many ways it is recorded".

### Task 4: Seven Safest steps

**Files:**
- Create: `prisma/migrations/20261020100000_safest_inspected_at/migration.sql`. It is `ALTER TABLE "Order" ADD COLUMN "inspectedAt" TIMESTAMP(3);`.
- Modify:
  - `prisma/schema.prisma`: `inspectedAt`, plus a "retired" comment on `AWAITING_BUYER_PAYMENT`.
  - `src/lib/deal-templates.ts`: the doc comment says the rows are seeded at creation.
  - `src/lib/deal-machine.ts`: remove the status from `TRANSITIONS`, `AGENT_HOLDS` and `DISPUTABLE`.
  - `src/server/deals.ts`: `STEP_TIMESTAMP`, plus the return guard in `resolveDeal`.
  - `src/components/deals/deal-status.ts`:
    - drop the `SAFEST:AWAITING_BUYER_PAYMENT:seller` override;
    - reword that status in `STATUS_LABELS`, `STATUS_SHORT` and `STATUS_TONE` as retired.
  - `src/components/admin/vocab.tsx:40`: reworded the same way.
  - `src/lib/deal-panel.ts`
  - `src/server/deal-feed.ts:202`
  - `src/components/admin/stuck-deals.tsx:38`
- Test:
  - `src/lib/deal-templates.test.ts`
  - `src/lib/deal-machine.test.ts`
  - `src/server/deal-flow.test.ts`: `runTo` stops passing `paymentRef`.
  - `src/server/custody-safety.test.ts`
  - `src/server/deal-guards.test.ts`
  - `src/server/e2e-lifecycle.test.ts`
  - `src/components/deals/deal-status.test.ts`
  - `src/lib/deal-panel.test.ts`
  - `src/server/deal-agent.test.ts`: the `HOLDING` list, and the helper at `:251`.
  - `src/server/agent-demotion.test.ts:37`

**Interfaces:**
- Consumes: Task 2's money behaviour.
- Produces: `SAFEST_STEPS` with seven steps.

  | # | Label | Actor | Enters | Flags |
  |---|-------|-------|--------|-------|
  | 1 | "Pay the price and the fee" | buyer | | |
  | 2 | "Invite the agent as channel owner" | seller | | |
  | 3 | "Accept and confirm custody" | agent | | |
  | 4 | "Hold 1 complete, ownership verified" | agent | `IN_CUSTODY` | |
  | 5 | "Inspect the channel" | buyer | `AWAITING_HANDOVER` | |
  | 6 | "Transfer ownership to the buyer" | agent | | `needsApprovalAbove`, `handsOver` |
  | 7 | "Hold 2 complete, ownership verified" | agent | `COMPLETED` | `needsApprovalAbove` |

- Produces: `STEP_TIMESTAMP.SAFEST = { 4: "custodyAt", 5: "inspectedAt", 6: "handoverAt" }`.
- Produces the return rule: once `inspectedAt` is set, a return needs `DISPUTED` first (`needs-dispute`). This holds after `handoverAt` as well. Nothing blocks a finance return from a dispute before `COMPLETED`.

- [ ] **Step 1: Write the failing tests.**
  - **deal-templates.test:**
    - `safest has seven steps in the spec's order`, with the labels above;
    - `both safest transfer steps need a second approval above the threshold`.
  - **deal-machine.test:**
    - the buyer may move `IN_CUSTODY` → `AWAITING_HANDOVER`;
    - no transition names `AWAITING_BUYER_PAYMENT`;
    - `AGENT_HOLDS` omits it.
  - **custody-safety and deal-guards:**
    - `returning the channel after the buyer approved it needs a dispute`;
    - `a failed second transfer can still be returned from a dispute`: with `handoverAt` set, a finance return from `DISPUTED` refunds the price.
    - Delete the tests built on `buyerPaidAt` and `sellerConfirmedAt`.
  - **deal-flow.test:** `a deal view tells each side what is theirs to do` now has `totalUsd` 10_300.
  - **e2e-lifecycle:** `a safest deal, from listing to completed` sees the platform net 300 and the seller hold 10_000.
  - **deal-status.test:**
    - delete `after the buyer records paying, the seller is asked to confirm`;
    - add `a safest seller waiting on the inspection is told the money is already held`.
- [ ] **Step 2: Run them.** `pnpm -s vitest run src/lib/deal-templates.test.ts src/lib/deal-machine.test.ts src/server/custody-safety.test.ts src/server/deal-guards.test.ts src/server/deal-flow.test.ts src/server/e2e-lifecycle.test.ts src/components/deals/deal-status.test.ts src/lib/deal-panel.test.ts src/server/deal-agent.test.ts`
  - Expected: FAIL.
- [ ] **Step 3: Apply the migration** to `channeladda_test` and `channeladda_e2e`, then generate. Implement the Interfaces.
- [ ] **Step 4: Run Step 2's command, then the suite and the typecheck.**
  - Expected: green.
- [ ] **Step 5: Commit** with the message "feat: Safest runs in seven steps, with no payment between buyer and seller".

### Task 5: Remove the direct-payment machinery

**Files:**
- Create: `prisma/migrations/20261020110000_drop_direct_payment/migration.sql`. It drops `sellerPayTo`, `sellerPayToAt`, `sellerPayToChangedAt`, `buyerPaymentRef`, `buyerPaidAt` and `sellerConfirmedAt`.
- Delete:
  - `src/lib/pay-to.ts` and its test
  - `src/server/pay-to.ts` and its test
  - `src/components/deals/pay-to.tsx`
- Modify:
  - `src/server/actions/deals.ts`: remove `savePayTo`, `PAY_TO_MESSAGES`, the `needs-reference` message and step `paymentRef`.
  - `src/server/deals.ts`:
    - the pay-to select, visibility and DealView fields;
    - the step-5 seller reminder;
    - `buyerPaymentRef` writes;
    - the `needs-reference` branch.
  - `src/components/deals/deal-timeline.tsx`: `CONFIRM_LABELS` entries for the removed labels, `WHY_THE_REFERENCE`, `wantsRef` and the reference field.
  - `src/components/deals/deal-status.ts`: `needsPaymentRef` and the removed labels' `STEP_HELP` entries.
  - The deal page, the conversation page and `src/components/messages/deal-panel.tsx`: the `PayToCard`.
  - `src/lib/chat-events.ts`: `pay-to-saved` stays parseable and renders nothing.
  - `src/server/admin-disputes.ts` (`:99-108`, `:195-204`) and `src/components/admin/dispute-case.tsx`: `inspectedAt` replaces `buyerPaidAt` and `sellerConfirmedAt`.
- Test:
  - `src/lib/chat-events.test.ts`
  - `src/server/deal-chat-e2e.test.ts`
  - `src/server/admin-disputes.test.ts`
  - `src/server/logic-fixes.test.ts`: delete `a safest buyer cannot record paying the seller without saying how`.

- [ ] **Step 1: Write the failing tests.**
  - **chat-events.test:** `an old pay-to event is skipped, not rendered`.
  - **deal-chat-e2e:** the Safest case never calls `savePayTo`, and the buyer's deal view has no `payTo` key.
  - **admin-disputes.test:** the case facts carry `inspectedAt`.
- [ ] **Step 2: Run them.** `pnpm -s vitest run src/lib/chat-events.test.ts src/server/deal-chat-e2e.test.ts src/server/admin-disputes.test.ts`
  - Expected: FAIL.
- [ ] **Step 3: Implement**, then apply the migration and generate.
  - Then run `grep -rn "payTo\|PayTo\|buyerPaidAt\|sellerConfirmedAt\|buyerPaymentRef" src --include=*.ts --include=*.tsx | grep -v generated`.
  - Expected: no output.
- [ ] **Step 4: Run Step 2's command, the suite and the typecheck.**
  - Expected: green.
- [ ] **Step 5: Commit** with the message "refactor: the seller's pay-to details and the buyer's payment reference are gone".

### Task 6: The seller sees held sales in their wallet

**Files:**
- Modify:
  - `src/server/wallet.ts`
  - `src/app/(dashboard)/dashboard/wallet/page.tsx`: a new section, plus copy at `:61-70`, `:272-293` and `:321`.
  - `src/app/(dashboard)/dashboard/page.tsx:402-404`
- Test: `src/server/wallet.test.ts`

**Interfaces:**
- Produces: `Wallet` gains `heldForSales: HeldSale[]` and `heldForSalesUsd: number`, where:

  ```ts
  HeldSale = {
    orderId: string;
    reference: string;
    title: string;
    mode: DealMode;
    amountUsd: number;
    paidAt: Date;
  }
  ```

  - `amountUsd` is `priceUsd − sellerFeeUsd`.
  - A sale counts as held when the user is the seller, `paymentRef` is not null, and the status is not terminal. This applies in both modes.

- [ ] **Step 1: Write the failing tests.**
  - `a seller sees a paid sale as held, not as balance`: 10_000 held, with its reference, and `balanceUsd` 0.
  - `a held sale moves to the balance on completion`.
  - `a held sale cannot be withdrawn`: `requestWithdrawal` of $100 fails with the existing insufficient-balance error.
  - `a fastest sale is held the same way`.
- [ ] **Step 2: Run them.** `pnpm -s vitest run src/server/wallet.test.ts`
  - Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Add one `db.order.findMany` to `getWallet`'s `Promise.all`, ordered by `paidAt` desc.
  - The page section sits under the balance tiles. Each row shows:
    - the reference, linking to the deal;
    - the title;
    - the amount, as `Price`;
    - the line "Moves to your balance when the transfer completes."
  - Render nothing when nothing is held.
- [ ] **Step 4: Run Step 2's command and the suite.**
  - Expected: green.
- [ ] **Step 5: Commit** with the message "feat: a seller's wallet shows the sales Channel Adda is holding for them".

### Task 7: Paying from a balance that is short

**Files:**
- Create: `src/lib/pay-options.ts` and its test
- Modify:
  - `src/components/deals/pay-now.tsx`
  - `src/server/actions/wallet.ts`: `startTopUp(dollars, returnTo?)`. `returnTo` is used as the `successUrl` only when `safeNext(returnTo)` returns it unchanged.

**Interfaces:**
- Produces:

  ```ts
  balanceRoute(availableUsd, totalUsd):
    | { kind: "balance" }
    | { kind: "top-up"; topUpUsd: number }
    | { kind: "invoice-only" }
  ```

  All amounts are in cents.
  - `available >= total` → `balance`.
  - `0 < available < total` → `top-up` with `topUpUsd = max(total − available, 1_000)`, when that is ≤ 1_000_000.
  - Otherwise → `invoice-only`.

- [ ] **Step 1: Write the failing tests.**
  - `a covered total pays from the balance`.
  - `a short balance tops up exactly the difference`: (100_000, 515_000) → 415_000.
  - `a tiny shortfall tops up the $10 minimum`: (10_000, 10_300) → 1_000.
  - `an empty balance or a shortfall over $10,000 pays by invoice only`.
- [ ] **Step 2: Run them.** `pnpm -s vitest run src/lib/pay-options.test.ts`
  - Expected: FAIL.
- [ ] **Step 3: Implement.**
  - On `top-up`, PayNow shows "You have {available}. Add {topUp} to pay from your balance."
  - A secondary button calls `startTopUp(topUp / 100, "/dashboard/deals/<id>")` and follows the returned checkout URL, the same way the crypto button does.
  - The Safest body reads: "The channel price and our fee. Channel Adda holds the price until the channel is yours, then pays the seller."
- [ ] **Step 4: Run Step 2's command, the suite, and the React Compiler check on `pay-now.tsx`.**
  - Expected: green, with zero bailouts.
- [ ] **Step 5: Commit** with the message "feat: a buyer with part of the price in their balance tops up the difference and pays from it".

### Task 8: Deal screens and emails say what now happens

**Files:**
- Modify:
  - `src/components/deals/deal-status.ts`: the headlines and sentences the research lists, plus `STEP_HELP`.
  - `src/app/(dashboard)/dashboard/deals/[id]/page.tsx`: `:231-232` and `:294-305`. Safest now shows the "Channel Adda is holding" rows "The channel" and "Your payment".
  - `src/server/deal-notify.ts:46-49`
- Test:
  - `src/components/deals/deal-status.test.ts`
  - `src/server/deal-notify.test.ts`
  - `src/lib/deal-panel.test.ts`

- [ ] **Step 1: Write the failing tests.**
  - **deal-notify:** `it says which kind of deal`.
    - The Safest email contains "our agent takes ownership of the channel" and "We hold your payment until the channel is yours".
    - Neither email contains "pays the seller directly".
  - **deal-status:** `a safest buyer who has paid is told the money is held`.
  - **deal-panel:** the label is "Pay the price and the fee".
- [ ] **Step 2: Run them.** `pnpm -s vitest run src/components/deals/deal-status.test.ts src/server/deal-notify.test.ts src/lib/deal-panel.test.ts`
  - Expected: FAIL.
- [ ] **Step 3: Rewrite the copy** from the spec's three replacement lines, adapted for buyer, seller and agent.
- [ ] **Step 4: Run Step 2's command and the suite.**
  - Expected: green.
- [ ] **Step 5: Commit** with the message "copy: deal screens and emails describe Safest as paid through Channel Adda".

### Task 9: Site, help, legal and staff desks, with a guard against the old promise

**Files:**
- Create: `src/lib/copy-guard.test.ts`
- Modify every user-facing copy line the research lists, including:
  - `auth-shell.tsx`, "We hold the money, or we hold the account.";
  - trust-safety `:19`;
  - help `:60`;
  - deal-controls `:511`.

- [ ] **Step 1: Write the failing test** `no page tells anyone to pay a seller directly`.
  - Read every `.ts` and `.tsx` file under `src`, except tests and `src/generated`.
  - Fail on any case-insensitive match of these patterns:
    - `pays? the seller directly`
    - `never holds? the (channel's )?price`
    - `(pay|paid|pays|payment)[^.\n]{0,30}off-platform`
    - `paid direct\b`
    - `price never (passes|passed|reaches|touches)`
    - `Buyer pays the seller`
  - Name each file and line in the failure message.
  - Moderation copy about taking deals off-platform stays allowed.
- [ ] **Step 2: Run it.** `pnpm -s vitest run src/lib/copy-guard.test.ts`
  - Expected: FAIL, listing the offenders.
- [ ] **Step 3: Rewrite each offender.**
  - **`legal.ts`, Terms and Refunds** (`:31`, `:33`, `:53`, `:77`, `:158-184`) must say:
    - Channel Adda holds the buyer's payment on both kinds of deal;
    - the price is refunded if the channel does not reach the buyer;
    - the fee is kept once the agent has held the channel.

    Collect the new paragraphs for the owner's review.
  - **trust-safety `:19`:** "Money we hold for a sale is not in the seller's balance until the deal completes, so it cannot be withdrawn while a dispute is open."
  - **help `:60`:** delete the partial-settlement sentence.
  - **deal-controls `:511`:** correct the fee-return line.
- [ ] **Step 4: Run Step 2's command, the suite, and `pnpm -s build` against the e2e database.**
  - Expected: green, and the build succeeds.
- [ ] **Step 5: Commit** with the message "copy: every page says the buyer pays Channel Adda, and a test keeps it that way".

### Task 10: Walk it in the browser

**Files:** none. A defect found here is fixed under TDD in the owning task's files and committed separately.

- [ ] **Step 1:** Restart the 3122 dev server against `channeladda_e2e`. Use the test accounts in `.superpowers/revamp/test-account.md`.
- [ ] **Step 2: Walk a Safest deal to completion.**
  1. As the buyer, start the deal. The pay panel shows price + fee.
  2. As staff, record "Payment received" (Cryptomus is off in the worktree).
  3. As the seller, the wallet shows the sale under "Held for your sales", and the deal says the money is held.
  4. Run steps 2–4. There is no pay-to card anywhere.
  5. As the buyer, inspect.
  6. As the agent, run steps 6 and 7.
  7. The seller's balance shows the price, and "Held for your sales" is empty.
- [ ] **Step 3: Return a second Safest deal after custody.**
  - A MODERATOR is refused.
  - FINANCE succeeds.
  - The buyer's balance shows the price.
  - The money desk's held-for-buyers and the month's fees stay correct.
- [ ] **Step 4: Record the walkthrough** in `.superpowers/revamp/progress.md`.
