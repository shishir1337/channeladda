# Safest on-platform payment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Safest buyer pays the admin fee to start, as today. Once our agent holds the channel and the buyer has inspected it, the buyer pays the price to Channel Adda, by Cryptomus or from their balance. The price is held and released into the seller's Channel Adda wallet on completion. Nothing moves directly between buyer and seller.

**Architecture:**

- **Holding.** Everything a buyer pays, in either mode, is booked as a platform `ESCROW_HOLD`. It becomes `BUYER_FEE`, `SELLER_FEE` or a seller's `ESCROW_RELEASE` only when earned. Every move first checks that the platform's hold matches what it should be.
- **The price payment.** It is a second payment stage on Safest orders: invoice purpose `DEAL_PRICE`, reference `buyerPaymentRef`, and stamp `buyerPaidAt`. A system-only step 6 records it.
- **Removed.** The seller's "money arrived" step and the "where to pay me" machinery.
- **Added.** The seller's wallet gains a "Held for your sales" section.

**Tech Stack:** Next.js 16, React 19 with the React Compiler, Prisma 7 on Postgres 16, Vitest, Biome.

**Spec:** `docs/superpowers/specs/2026-10-18-safest-on-platform-payment-design.md` (owner-decided).

**Research:** `.superpowers/revamp/money-model-report.md` cites every current money path, step dependency and copy line by file:line.

## Global Constraints

- **No money moves directly between a buyer and a seller.** Remove every path, field and sentence that says otherwise.
- **Amounts.** Safest `totalUsd` stays the buyer fee alone; it is the up-front payment. The price is `priceUsd`, paid at step 6. `sellerFeeBp` applies to both modes. `payoutUsd = priceUsd − sellerFeeUsd`.
- **Required platform hold on an order:**
  - nothing paid yet → 0;
  - Fastest → `totalUsd`;
  - Safest → `buyerFeeUsd`, plus `priceUsd` once `buyerPaidAt` is set.
- **Withdrawals.** The seller's price becomes withdrawable only on `COMPLETED`. There is no waiting period after a Safest completion.
- **Platform position on an order:**
  - Completed → buyer fee + seller fee.
  - Returned after custody → buyer fee.
  - Cancelled before custody → 0.
- **Refunds.** A paid return or cancel needs FINANCE or SUPERADMIN. The Safest fee is kept once `custodyAt` is set.
- **Approvals.** Safest step 7 (transfer) and step 8 (Hold 2, which completes the deal) carry `needsApprovalAbove` (`secondApprovalAboveUsd`, default 500000 cents).
- **Stalled deals.** Staff unstick them from the Stuck deals desk. There are no automatic timers.
- **Migrations:**
  - Hand-written SQL in `prisma/migrations/`, named after `20261019100000_conversation_reads`.
  - Tables are `"Order"`, `"LedgerEntry"`, `"Listing"`, `"Invoice"`.
  - `LedgerEntry.id` and every `updatedAt` have no database default.
  - Cast enum literals, e.g. `'REFUND'::"LedgerKind"`.
  - Apply only to `channeladda_test` and `channeladda_e2e` (`DATABASE_URL=<db> pnpm db:migrate`, then `pnpm -s prisma generate`). Never apply to `channeladda`.
- **Tests:**
  - Vitest runs only when `DATABASE_URL_TEST` names a `_test` database.
  - Redirect full-suite output to a scratch file and read the tail.
- **Before each commit:**
  - `pnpm -s exec biome check .`
  - `pnpm -s exec tsc --noEmit -p .`
  - The React Compiler check (`node rc2.cjs <file>` from the session scratchpad) on every changed client component, with zero bailouts.
  - An explicit file list to commit, and the session's attribution lines.
- **Secrets.** Never print Cryptomus keys, the dev password or any API key.
- **Copy.** Plain sentences, no "seamless", no exclamation marks, money through the `Price` component.

## Review Focus

1. **An underpaid price.** A price invoice paid at or above the fee, but below the price, must not complete step 6. Test: Task 4, `an underpaid price invoice does not move the deal`.
2. **A price paid twice.** If the price arrives twice (invoice and balance, or invoice and by hand), it is applied once. Any second arrival goes to the buyer's balance once. Tests: Task 3, `a second price payment goes to the buyer's balance`; Task 5, `a price recorded by hand is refused while a price invoice is open`.
3. **A price that arrives after a return.** It is credited to the buyer's balance at the price amount. Test: Task 4, `a late price payment is credited at the price`.
4. **A seller withdrawing held money.** The withdrawal is refused. Test: Task 8, `a held sale cannot be withdrawn`.
5. **Old chat history.** Old conversations with `pay-to-saved` events and old step labels render without throwing. Test: Task 6, `an old pay-to event is skipped, not rendered`.

---

### Task 1: Close the running Safest test deals and re-label refunded fees

This goes first, so no old-flow order ever meets the new code.

**Files:**
- Create: `prisma/migrations/20261020090000_close_old_safest_deals/migration.sql`

- [ ] **Step 1: Snapshot the e2e database.** Save to the scratchpad:
  - `select status, count(*) from "Order" where mode='SAFEST' group by 1;`
  - the platform sum per Safest order.
- [ ] **Step 2: Write one transaction.** "Running" means Safest with status `AWAITING_PAYMENT`, `AWAITING_CUSTODY`, `IN_CUSTODY`, `AWAITING_BUYER_PAYMENT`, `AWAITING_HANDOVER` or `DISPUTED`.
  1. **Refund what the platform holds.** For each running order, take the platform sum for that order. Where it is above 0, insert a `REFUND` pair: platform −held, buyer +held.
     - Note: `Closed when Safest moved to on-platform payment`.
     - ids: `'mig_' || md5(random()::text || o.id || side)`.
  2. **Close the order.**
     - `status` becomes `'CANCELLED'` where `"custodyAt"` is null, otherwise `'RETURNED_TO_SELLER'`, cast to `"OrderStatus"`.
     - Set `"cancelledAt" = now()` and `"updatedAt" = now()`.
  3. **Reopen the listing.** Listings that are `'RESERVED'` become `'LIVE'`, with `"updatedAt" = now()`.
  4. **Re-label refunded fees.** Retag platform `BUYER_FEE` rows to `ESCROW_HOLD` on every Safest order that is not `COMPLETED` and has a platform `REFUND` row.
  - Do not touch `TransferStep`.
- [ ] **Step 3: Apply to e2e and test**, then re-run the Step 1 queries. Expected:
  - no running Safest order;
  - each closed order's platform sum is 0;
  - completed Safest orders are unchanged against the snapshot;
  - no `BUYER_FEE` row remains on a refunded, non-completed Safest order.
- [ ] **Step 4: Run the whole suite.** Expected: green.
- [ ] **Step 5: Commit**: "chore: running Safest test deals close before Safest moves its money on-platform".

### Task 2: Everything paid is held until it is earned

The Safest flow is still old here. Only the fee is on our books, so completion earns the fee and credits the seller nothing.

**Files:**
- Create: `src/lib/holds.ts` and `src/lib/holds.test.ts`
- Modify:
  - **`src/server/deals.ts`:**
    - opening payment rows in `recordOpeningPayment`;
    - `completeOrder`;
    - the cancel/return block of `resolveDeal`;
    - `movesPlatformMoney`;
    - a new `platformHoldFor`.
  - **`src/server/wallet.ts`:** the platform row in `payFromWallet`.
  - **`src/server/admin-money.ts`:**
    - drop the `mode: "FASTEST"` filters from `HELD_FOR_BUYERS`;
    - replace `expectedHold` with `requiredHold`;
    - rename `fastestHoldMismatches` to `holdMismatches`, and update its callers;
    - month figures at `:234-265`: fees net is the platform `BUYER_FEE` + `SELLER_FEE` rows, `REFUND` no longer reduces revenue, and `paidIn` covers both modes.
  - **`src/components/admin/vocab.tsx`:** `custodyFacts.platformHolds` is true for any paid order.
  - **`src/components/admin/deal-controls.tsx`:** the "Finance only" badge (`:773-777`) and the return's weight (`:503-506`) follow `movesPlatformMoney`.
  - **`src/server/actions/deals.ts`:** a message for `books-mismatch`.
- Test:
  - `src/server/deals.test.ts`
  - `src/server/wallet.test.ts`
  - `src/server/deal-flow.test.ts`
  - `src/server/deal-guards.test.ts`
  - `src/server/custody-safety.test.ts`: returns at `:134`, `:301`, `:329` and `:539` run as FINANCE.
  - `src/server/agent-thread-access.test.ts`
  - `src/server/review-fixes.test.ts`
  - `src/server/admin-money.test.ts`

**Interfaces:**
- Produces in `src/lib/holds.ts`:
  - `requiredHold(order: { mode; paymentRef; totalUsd; buyerFeeUsd; priceUsd; buyerPaidAt }): number`. In this task Safest returns `buyerFeeUsd` only; Task 3 adds the price term.
  - `keptFee(order: { mode; custodyAt; buyerFeeUsd }): number`. Returns `buyerFeeUsd` for Safest with `custodyAt`, else 0.
- Produces in `src/server/deals.ts`:
  - `platformHoldFor(tx, orderId): Promise<number>`: the sum of platform `ESCROW_HOLD`, `ESCROW_RELEASE` and `REFUND` rows on the order.
  - The `DealFailure` reason `"books-mismatch"`.

- [ ] **Step 1: Write the failing tests.** Seeded price 10_000; buyer fee 300 bp.
  - **holds.test:**
    - `nothing is held before payment`
    - `fastest holds the total`
    - `safest holds the fee`
    - `safest keeps its fee once custody is reached`
  - **deals.test:** `a paid safest deal holds the fee, it does not earn it yet`. Expect one platform `ESCROW_HOLD` of +300 and no `BUYER_FEE`.
  - **wallet.test:** `paying a safest fee from the balance holds it`. The buyer gets `ESCROW_HOLD` −300 and the platform `ESCROW_HOLD` +300.
  - **deal-flow.test:** `a completed safest deal earns its fee`. Expect platform `ESCROW_RELEASE` −300, `BUYER_FEE` +300, and a position of 300.
  - **deal-guards.test:**
    - `cancelling before custody refunds the fee`: position 0, held-for-buyers 0, and the month's fees net 0.
    - `returning after custody keeps the fee`: `ESCROW_RELEASE` −300, `BUYER_FEE` +300.
    - `returning a paid safest deal needs finance`: a MODERATOR is refused.
    - `a refund refuses an order whose hold does not match`: an extra platform `ESCROW_HOLD` +1 gives `books-mismatch`, and no row is written.
  - **admin-money.test:**
    - The books test now counts Safest holds.
    - `a refunded safest fee is not counted as revenue`.
    - `a safest hold that does not match its order is reported`.
  - **review-fixes.test:** `cancelling a wallet-paid safest deal returns the fee to the wallet` is unchanged and still passes.
- [ ] **Step 2: Run them.** Expected: FAIL.

  ```
  pnpm -s vitest run src/lib/holds.test.ts src/server/deals.test.ts src/server/wallet.test.ts src/server/deal-flow.test.ts src/server/deal-guards.test.ts src/server/admin-money.test.ts src/server/review-fixes.test.ts
  ```

- [ ] **Step 3: Implement.**
  - **Opening payment (both paths):** the platform row is `ESCROW_HOLD` +`totalUsd` in both modes.
  - **`completeOrder`:**
    - Throw `DealAbort("books-mismatch")` unless `platformHoldFor === requiredHold`.
    - Write `ESCROW_RELEASE` −`requiredHold` and `BUYER_FEE` +fee.
    - The seller's `ESCROW_RELEASE` +price and the `SELLER_FEE` pair are written only when the price is held: Fastest always, Safest from Task 3.
  - **`resolveDeal`:**
    - Run the same check.
    - Refund `held − keptFee`.
    - When `keptFee > 0`, write `ESCROW_RELEASE` −fee and `BUYER_FEE` +fee.
  - **`movesPlatformMoney`:** true for `RETURNED_TO_SELLER` and `CANCELLED` whenever `paymentRef` is set.
  - **Comments:** rewrite the ones that say Safest never holds money. The research lists them.
- [ ] **Step 4: Run Step 2's command, then `custody-safety.test.ts` and `agent-thread-access.test.ts`, then the whole suite.** Fix the fee-classification expectations in `deal-feed.test`, `admin-disputes.test`, `deal-events.test` and `e2e-lifecycle.test`. Expected: green.
- [ ] **Step 5: Commit**: "feat: everything a buyer pays is held until it is earned, in both modes".

### Task 3: The buyer pays the price into Channel Adda (balance and by hand)

**Files:**
- Create: `prisma/migrations/20261020100000_safest_price_payment/migration.sql` with `ALTER TYPE "InvoicePurpose" ADD VALUE 'DEAL_PRICE';`.
- Modify:
  - **`prisma/schema.prisma`:** the enum value, and comments on `buyerPaidAt` and `buyerPaymentRef` saying the system now sets them.
  - **`src/lib/deal-templates.ts`:** `SAFEST_STEPS`, per Interfaces. Also fix the doc comment so it says rows are seeded at creation.
  - **`src/lib/deal-machine.ts`:** `AWAITING_BUYER_PAYMENT → AWAITING_HANDOVER` by `system`, not `seller`.
  - **`src/lib/holds.ts`:** Safest adds `priceUsd` once `buyerPaidAt` is set.
  - **`src/lib/fees.ts`:** `sellerFeeUsd` is computed in both modes.
  - **`src/server/deals.ts`:**
    - `STEP_TIMESTAMP.SAFEST = { 4: "custodyAt", 8: "handoverAt" }`;
    - `advanceStep` refuses Safest step 6 for everyone, with `"pay-in-checkout"`;
    - the new `recordPricePayment` and `recordManualPricePayment`;
    - the seller credit in `completeOrder` for Safest;
    - the `resolveDeal` return guard: `needs-dispute` keyed on `buyerPaidAt`, and drop the `already-paid` guard.
  - **`src/server/wallet.ts`:** `payFromWallet` is stage-aware.
  - **`src/server/actions/deals.ts`:** `markPriceReceived` (FINANCE), plus messages for `pay-in-checkout`.
  - **`src/components/deals/deal-status.ts`:** remove the `SAFEST:AWAITING_BUYER_PAYMENT:seller` override; add a seller sentence saying the buyer is paying Channel Adda.
- Test:
  - `src/lib/deal-templates.test.ts`
  - `src/lib/deal-machine.test.ts`
  - `src/lib/holds.test.ts`
  - `src/lib/fees.test.ts`
  - `src/server/deal-flow.test.ts`: `runTo` pays the price with `recordPricePayment` instead of passing `paymentRef`.
  - `src/server/custody-safety.test.ts`
  - `src/server/deal-guards.test.ts`
  - `src/server/e2e-lifecycle.test.ts`
  - `src/server/wallet.test.ts`
  - `src/components/deals/deal-status.test.ts`
  - `src/lib/deal-panel.test.ts`
  - Helpers at `src/server/deal-agent.test.ts:251` and `src/server/agent-demotion.test.ts:37`.

**Interfaces:**
- Consumes: Task 2's `requiredHold`, `platformHoldFor`, `keptFee`.
- Produces `SAFEST_STEPS`:

  | # | Label | Actor | Enters status | Flags |
  |---|-------|-------|---------------|-------|
  | 1 | "Pay the admin fee" | buyer | | |
  | 2 | "Invite the agent as channel owner" | seller | | |
  | 3 | "Accept and confirm custody" | agent | | |
  | 4 | "Hold 1 complete, ownership verified" | agent | `IN_CUSTODY` | |
  | 5 | "Inspect the channel" | buyer | `AWAITING_BUYER_PAYMENT` | |
  | 6 | "Pay the price to Channel Adda" | buyer | none; the payment performs the transition | |
  | 7 | "Transfer ownership to the buyer" | agent | | `needsApprovalAbove`, `handsOver` |
  | 8 | "Hold 2 complete, ownership verified" | agent | `COMPLETED` | `needsApprovalAbove` |

- Produces `recordPricePayment(orderId, reference, asset): Promise<OpeningOutcome>`. It uses the same outcome union as `recordOpeningPayment`.
  - **Same reference again:** `"already-applied"`.
  - **A different reference while `buyerPaymentRef` is set:** goes to `creditSecondPayment`, keyed on the price stage. A settled invoice for it becomes a buyer `DEPOSIT` at that invoice's amount.
  - **The order is not `SAFEST` in `AWAITING_BUYER_PAYMENT`:** goes to `creditUnusablePayment` at `priceUsd`.
  - **Otherwise, in one transaction:**
    - compare-and-set on `buyerPaymentRef: null, status: "AWAITING_BUYER_PAYMENT"`;
    - set `buyerPaymentRef`, `buyerPaidAt` and status `AWAITING_HANDOVER`;
    - complete step 6;
    - write the platform `ESCROW_HOLD` +`priceUsd`;
    - post the chat event "{buyer} paid {price} to Channel Adda. It is held until the channel is theirs."
  - **After commit:** `notifyNextActor`.
- Produces `recordManualPricePayment(orderId, txid, asset, byUserId)`. It audits the txid, then calls `recordPricePayment(orderId, `${order.reference}:price`, asset)`.
- Produces `payFromWallet(orderId, userId)`:
  - In `AWAITING_PAYMENT` it pays `totalUsd`, as today.
  - On Safest in `AWAITING_BUYER_PAYMENT` it pays `priceUsd` with `wallet:<ref>:price`. The ledger rows are buyer `ESCROW_HOLD` −price and platform `ESCROW_HOLD` +price, under the same compare-and-set and step 6 as `recordPricePayment`.

- [ ] **Step 1: Write the failing tests.**
  - **deal-templates.test:**
    - `safest has eight steps in the spec's order`, with the labels above;
    - `both safest transfer steps need a second approval above the threshold`.
  - **deal-machine.test:**
    - `the price payment moves a safest deal on, not the seller`: `system` is allowed and `seller` is refused.
  - **holds.test:** `safest holds the price once it is paid`.
  - **fees.test:** `the seller fee applies to safest sales`. At 500 bp the seller fee is 500, the payout 9_500, and the total still 300.
  - **deal-flow.test:**
    - `a safest deal pays the seller's wallet on completion`:
      - the seller balance is 10_000 and the platform position is 300;
      - with `sellerFeeBp: 500`, the seller balance is 9_500 and the platform position is 800.
    - `the buyer cannot mark the price paid themselves`: `advanceStep` on step 6 returns `pay-in-checkout`.
    - `a second price payment goes to the buyer's balance`: `recordPricePayment` under a second reference with a settled `DEAL_PRICE` invoice credits a `DEPOSIT` of that amount and does not move the deal.
  - **wallet.test:**
    - `a safest buyer pays the price from the balance`: available drops by 10_000 and the deal is `AWAITING_HANDOVER`.
    - `the price cannot be paid from the balance before the inspection`.
  - **deal-guards and custody-safety:**
    - `returning a channel after the price is paid needs a dispute, and refunds the price`: the buyer gets +10_000 and the fee is kept.
    - `a failed second transfer can still be returned from a dispute`: with `handoverAt` set, finance can return it from `DISPUTED`.
    - Delete every test built on `sellerConfirmedAt` or a typed `paymentRef`.
  - **e2e-lifecycle:** `a safest deal, from listing to completed`: the platform nets 300, the seller holds 10_000, and `buyerPaymentRef` starts with `wallet:` or is the manual name.
  - **deal-status.test:**
    - delete `after the buyer records paying, the seller is asked to confirm`;
    - add `a safest seller is told the buyer is paying Channel Adda`.
- [ ] **Step 2: Run the files under Test.** Expected: FAIL.
- [ ] **Step 3: Apply the migration and generate.** Then implement the Interfaces.
- [ ] **Step 4: Run Step 2's command, then the suite and typecheck.** Expected: green.
- [ ] **Step 5: Commit**: "feat: a Safest buyer pays the price into Channel Adda, and the seller is paid on completion".

### Task 4: The price by Cryptomus

**Files:**
- Modify:
  - **`src/server/actions/payments.ts`:** `startPayment` is stage-aware.
    - The opening stage uses `purpose: "DEAL"` with `totalUsd`.
    - The price stage, on Safest in `AWAITING_BUYER_PAYMENT`, uses `purpose: "DEAL_PRICE"` with `priceUsd`.
    - The invoice-reuse filter adds `purpose`.
  - **`src/app/api/webhooks/cryptomus/route.ts`:**
    - Route `DEAL_PRICE` invoices to `recordPricePayment`.
    - The underpaid check compares against `invoice.amountUsd`.
  - **`src/server/invoices.ts`:** in `reconcileOne`, the same routing and the same underpaid comparison.
  - **`src/server/deals.ts`:** `creditUnusablePayment(orderId, reference, amountUsd)` takes the amount from its caller.
  - **`src/server/admin-money.ts:550`:** "landed on deal" also matches `order.buyerPaymentRef === inv.reference`.
- Test: `src/server/pay-attempts.test.ts` (it already mocks `@/server/cryptomus`), `src/server/money-safety.test.ts`.

- [ ] **Step 1: Write the failing tests.**
  - `a price checkout raises an invoice for the price`: the purpose is `DEAL_PRICE` and the amount is 10_000.
  - `a price checkout never reuses the fee invoice`.
  - `a settled price invoice moves the deal through reconciliation`.
  - `an underpaid price invoice does not move the deal`: paid 300 of 10_000 leaves the deal in `AWAITING_BUYER_PAYMENT` with no ledger row.
  - `a late price payment is credited at the price`: after a return, a `DEPOSIT` of +10_000 goes to the buyer, once.
- [ ] **Step 2: Run them.** Run `pnpm -s vitest run src/server/pay-attempts.test.ts src/server/money-safety.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run Step 2's command and the suite.** Expected: green.
- [ ] **Step 5: Commit**: "feat: the Safest price can be paid by Cryptomus, checked against its own invoice".

### Task 5: One payment is credited once

**Files:**
- Modify: `src/server/deals.ts`
  - `recordManualPayment` and `recordManualPricePayment` refuse in two cases:
    - `"invoice-open"`: an invoice for that stage exists that is neither applied as dead nor refunded;
    - `"already-paid"`: that stage's reference is set.
  - `creditUnusablePayment` credits each stage at most once per order. A `late:` row for that stage blocks a second credit.
  - `resolveDeal`: when the audit row `payment.refunded_by_processor` exists for the order, a refunding outcome writes only the platform side, noted "Refunded by the processor", and credits nobody.
- Modify: `src/server/actions/deals.ts`, messages for the new refusals.
- Test: `src/server/money-safety.test.ts`

- [ ] **Step 1: Write the failing tests.** Each test asserts that no unexpected `DEPOSIT` or `REFUND` row is written.
  - `a payment recorded by hand is refused while a checkout invoice is open`
  - `a price recorded by hand is refused while a price invoice is open`
  - `a payment recorded by hand on a paid deal is refused`
  - `a late payment under two names is credited once`
  - `a deal refunded by the processor is not refunded again to the balance`
- [ ] **Step 2: Run them.** Run `pnpm -s vitest run src/server/money-safety.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run Step 2's command and the suite.** Expected: green.
- [ ] **Step 5: Commit**: "fix: one payment is credited once, however many ways it is recorded".

### Task 6: Remove the direct-payment machinery

**Files:**
- Create: `prisma/migrations/20261020110000_drop_direct_payment/migration.sql`. It drops `sellerPayTo`, `sellerPayToAt`, `sellerPayToChangedAt` and `sellerConfirmedAt`.
- Delete:
  - `src/lib/pay-to.ts` and its test
  - `src/server/pay-to.ts` and its test
  - `src/components/deals/pay-to.tsx`
- Modify:
  - **`src/server/actions/deals.ts`:** remove `savePayTo`, `PAY_TO_MESSAGES`, the `needs-reference` message and the step `paymentRef` input.
  - **`src/server/deals.ts`:** remove the pay-to select, visibility and DealView fields, the step-5 seller reminder, and the `needs-reference` branch.
  - **`src/components/deals/deal-timeline.tsx`:** remove the `CONFIRM_LABELS` entries for removed labels, `WHY_THE_REFERENCE`, `wantsRef` and the reference field.
  - **`src/components/deals/deal-status.ts`:** remove `needsPaymentRef` and the `STEP_HELP` entries for removed labels.
  - **The deal page, the conversation page and `src/components/messages/deal-panel.tsx`:** remove `PayToCard`.
  - **`src/lib/chat-events.ts`:** `pay-to-saved` still parses but renders nothing.
  - **`src/server/admin-disputes.ts` (`:99-108`, `:195-204`) and `src/components/admin/dispute-case.tsx`:** stop using `sellerConfirmedAt`. "Price paid to Channel Adda" now reads from `buyerPaidAt`.
- Test:
  - `src/lib/chat-events.test.ts`
  - `src/server/deal-chat-e2e.test.ts`
  - `src/server/admin-disputes.test.ts`
  - `src/server/logic-fixes.test.ts`: delete `a safest buyer cannot record paying the seller without saying how`.

- [ ] **Step 1: Write the failing tests.**
  - `an old pay-to event is skipped, not rendered`.
  - The deal-chat-e2e Safest case:
    - never calls `savePayTo`;
    - pays the price with `payFromWallet`;
    - the buyer's view has no `payTo` key.
  - The dispute case facts say the price was paid to Channel Adda.
- [ ] **Step 2: Run them.** Run `pnpm -s vitest run src/lib/chat-events.test.ts src/server/deal-chat-e2e.test.ts src/server/admin-disputes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement, apply the migration, and generate.**
- [ ] **Step 4: Run `grep -rn "payTo\|PayTo\|sellerConfirmedAt" src --include=*.ts --include=*.tsx | grep -v generated`.** Expected: no output. Then run Step 2's command, the suite and the typecheck. Expected: green.
- [ ] **Step 5: Commit**: "refactor: the seller's pay-to details and the confirm-receipt step are gone".

### Task 7: Paying the price on screen, and topping up a short balance

**Files:**
- Create: `src/lib/pay-options.ts` and its test.
- Modify:
  - **`src/components/deals/pay-now.tsx`:**
    - It takes `stage: "opening" | "price"` and `amountUsd`, and uses `balanceRoute`.
    - It calls `startPayment`, which is stage-aware since Task 4, and `payDealFromWallet`.
  - **The deal page (`src/app/(dashboard)/dashboard/deals/[id]/page.tsx:101-102, 187-198`):**
    - Render `PayNow` for the price stage in step 6's slot.
    - Remove the "Transaction reference" UI.
  - **`src/lib/deal-panel.ts:92-96` and the conversation page (`:239-246`):** the panel kind `pay` covers Safest `AWAITING_BUYER_PAYMENT`.
  - **`src/server/actions/wallet.ts`:** `startTopUp(dollars, returnTo?)`. It uses `returnTo` as the `successUrl` only when `safeNext(returnTo) === returnTo`.
  - **`src/components/admin/deal-controls.tsx` and `src/app/(admin)/admin/deals/page.tsx`:**
    - Add a "Price received" control (FINANCE) for Safest `AWAITING_BUYER_PAYMENT`, next to the existing "Payment received".
    - `describeInvoice` gets a price-stage variant.
- Test:
  - `src/lib/pay-options.test.ts`
  - `src/lib/deal-panel.test.ts`
  - `src/server/admin-money.test.ts` for the price-stage invoice description

**Interfaces:**
- Produces:

  ```ts
  balanceRoute(availableUsd, amountUsd):
    | { kind: "balance" }
    | { kind: "top-up"; topUpUsd: number }
    | { kind: "invoice-only" }
  ```

  All amounts are in cents.
  - `available >= amount`: `balance`.
  - `0 < available < amount`: `top-up` with `topUpUsd = max(amount − available, 1_000)`, provided that is at most 1_000_000.
  - Anything else: `invoice-only`.

- [ ] **Step 1: Write the failing tests.**
  - **pay-options:**
    - `a covered amount pays from the balance`
    - `a short balance tops up exactly the difference`: (100_000, 515_000) gives 415_000.
    - `a tiny shortfall tops up the $10 minimum`: (9_900, 10_000) gives 1_000.
    - `an empty balance or a shortfall over $10,000 pays by invoice only`
  - **deal-panel:** `buyer: safest price due` gives kind `pay` and the label "Pay the price to Channel Adda".
- [ ] **Step 2: Run them.** Run `pnpm -s vitest run src/lib/pay-options.test.ts src/lib/deal-panel.test.ts src/server/admin-money.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Price-stage body: "Pay the channel price to Channel Adda, never to the seller. We hold it until the channel is yours, then pay the seller."
  - Opening-stage body: "This is our fee to start. Once our agent owns the channel and you have inspected it, you pay the price, to Channel Adda as well."
  - A `top-up` route shows "You have {available}. Add {topUp} to pay from your balance." and a secondary button. The button calls `startTopUp(topUp / 100, "/dashboard/deals/<id>")` and follows the checkout URL the same way the crypto button does.
- [ ] **Step 4: Run Step 2's command and the suite.** Run the React Compiler check on `pay-now.tsx` and `deal-controls.tsx`. Expected: green, zero bailouts.
- [ ] **Step 5: Commit**: "feat: a Safest buyer pays the price on the deal page, and a short balance can be topped up to cover it".

### Task 8: The seller sees held sales in their wallet

**Files:**
- Modify:
  - `src/server/wallet.ts`
  - `src/app/(dashboard)/dashboard/wallet/page.tsx`: a new section, plus copy at `:61-70`, `:272-293` and `:321`.
  - `src/app/(dashboard)/dashboard/page.tsx:402-404`
- Test: `src/server/wallet.test.ts`

**Interfaces:**
- Produces: `Wallet` gains `heldForSales: HeldSale[]` and `heldForSalesUsd: number`.

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
  - A sale is held when the user is the seller, the status is not terminal, and the price is on our books:
    - Fastest: `paymentRef` is set;
    - Safest: `buyerPaidAt` is set.
  - `paidAt` is the moment that happened.

- [ ] **Step 1: Write the failing tests.**
  - `a seller sees a paid price as held, not as balance`
  - `a held sale moves to the balance on completion`
  - `a held sale cannot be withdrawn`: `requestWithdrawal` of $100 fails with the existing insufficient-balance error.
  - `a fastest sale is held the same way`
  - `a safest sale whose price is not paid yet is not shown as held`
- [ ] **Step 2: Run them.** Run `pnpm -s vitest run src/server/wallet.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Add one `db.order.findMany` to `getWallet`'s `Promise.all`.
  - The section sits under the balance tiles. Each row has:
    - the reference, linking to the deal;
    - the title;
    - the amount, rendered with `Price`;
    - the line "Moves to your balance when the transfer completes."
  - Render nothing when nothing is held.
- [ ] **Step 4: Run Step 2's command and the suite.** Expected: green.
- [ ] **Step 5: Commit**: "feat: a seller's wallet shows the sales Channel Adda is holding for them".

### Task 9: Deal screens and emails say what now happens

**Files:**
- Modify:
  - `src/components/deals/deal-status.ts`: the lines the research lists, and `STEP_HELP`.
  - `src/app/(dashboard)/dashboard/deals/[id]/page.tsx` (`:231-232`, `:294-305`): Safest shows "Channel Adda is holding" with "The channel", plus "Your payment" once the price is paid.
  - `src/server/deal-notify.ts:46-49`
- Test:
  - `src/components/deals/deal-status.test.ts`
  - `src/server/deal-notify.test.ts`

- [ ] **Step 1: Write the failing tests.**
  - `it says which kind of deal`:
    - The Safest email contains "you pay the price to Channel Adda".
    - The Fastest email contains "We hold your payment".
    - Neither email contains "pays the seller directly".
  - `a safest buyer who has paid the price is told it is held`
- [ ] **Step 2: Run them.** Run `pnpm -s vitest run src/components/deals/deal-status.test.ts src/server/deal-notify.test.ts`. Expected: FAIL.
- [ ] **Step 3: Rewrite the copy** from the spec's replacement lines, worded for the buyer, the seller and the agent.
- [ ] **Step 4: Run Step 2's command and the suite.** Expected: green.
- [ ] **Step 5: Commit**: "copy: deal screens and emails describe Safest as paid through Channel Adda".

### Task 10: Site, help, legal and staff desks, with a guard against the old promise

**Files:**
- Create: `src/lib/copy-guard.test.ts`
- Modify: every user-facing copy line the research lists, including:
  - `auth-shell.tsx`, the line "We hold the money, or we hold the account.";
  - trust-safety `:19`;
  - help `:60`;
  - deal-controls `:511`.

- [ ] **Step 1: Write the failing test** `no page tells anyone to pay a seller directly`.
  - It reads every `.ts` and `.tsx` file under `src`, skipping tests and `src/generated`.
  - It fails on any case-insensitive match of:
    - `pays? the seller directly`
    - `never holds? the (channel's )?price`
    - `(pay|paid|pays|payment)[^.\n]{0,30}off-platform`
    - `paid direct\b`
    - `price never (passes|passed|reaches|touches)`
    - `Buyer pays the seller`
  - The failure message names each file and line.
- [ ] **Step 2: Run it.** Run `pnpm -s vitest run src/lib/copy-guard.test.ts`. Expected: FAIL, listing the offenders.
- [ ] **Step 3: Rewrite each offender.**
  - **Terms and Refunds in `legal.ts`** (`:31`, `:33`, `:53`, `:77`, `:158-184`). The new text says:
    - Channel Adda holds what the buyer pays on both kinds of deal;
    - on Safest the price is paid to Channel Adda once the agent holds the channel;
    - it is refunded if the channel does not reach the buyer;
    - the fee is kept once the agent has held the channel.

    Collect these paragraphs for the owner.
  - **trust-safety `:19`:** "Money we hold for a sale is not in the seller's balance until the deal completes, so it cannot be withdrawn while a dispute is open."
  - **help `:60`:** delete the partial-settlement sentence.
  - **deal-controls `:511`:** correct the fee-return line.
- [ ] **Step 4: Run Step 2's command, the suite, and `pnpm -s build` against the e2e database.** Expected: green, and the build succeeds.
- [ ] **Step 5: Commit**: "copy: every page says the buyer pays Channel Adda, and a test keeps it that way".

### Task 11: Walk it in the browser

**Files:** none. A defect found here is fixed under TDD in the owning task's files and committed separately.

- [ ] **Step 1: Restart the 3122 dev server** against `channeladda_e2e`. Use the test accounts in `.superpowers/revamp/test-account.md`.
- [ ] **Step 2: Run a Safest deal to completion.**
  1. Buyer: start the deal. The panel shows the fee only.
  2. Staff: "Payment received" (Cryptomus is off in the worktree).
  3. Steps 2–5 run. No pay-to card appears anywhere.
  4. Buyer: the step 6 panel asks for the price. Pay from the balance, topping it up through "Price received" on a second deal if needed.
  5. Seller: the wallet shows "Held for your sales".
  6. Agent: steps 7–8 run.
  7. Seller: the balance shows the price, and "Held for your sales" is empty.
- [ ] **Step 3: Return a second Safest deal after the price was paid.**
  - It needs a dispute first.
  - A MODERATOR is refused; FINANCE succeeds.
  - The buyer's balance shows the price.
  - The money desk's held-for-buyers and the month's fees stay right.
- [ ] **Step 4: Record the walkthrough** in `.superpowers/revamp/progress.md`.
