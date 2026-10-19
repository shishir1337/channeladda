# Deal flows v2 (client's second feedback) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Safest becomes "the agent holds the channel while the buyer pays the seller directly"; Fastest becomes "the buyer is a manager through a holding period, then primary owner, then the seller is paid" — exactly as the client confirmed on 2026-10-20.

**Architecture:** The step templates (`src/lib/deal-templates.ts`) and the transition table (`src/lib/deal-machine.ts`) carry both flows as data. A step can now start the deal's one hold (`startsHold`), and while `Order.holdUntil` is in the future no step can be completed; a cron sweep announces the end of a hold to the next actor. Safest's on-platform price payment (commit 3643160) is removed: Channel Adda only ever holds the Safest admin fee again.

**Tech Stack:** Next.js 16, Prisma 7 / Postgres, Vitest 5, Biome.

**Spec:** the flow text the owner sent the client (in this session), with the client's two corrections:
- Safest step 9: after "Received", the agent makes the buyer the owner (no second 7-day wait).
- Fastest step 3: the *buyer* is made manager (not the agent), the 7-day holding period starts then; after it the seller's email is removed and the buyer made primary; the deal completes and the agent pays the seller.

## Global Constraints

- Never migrate the dev DB `channeladda`; migrations are hand-written SQL, applied to `channeladda_test`, `_e2e`, `_demo` only.
- Never delete an applied migration (3643160's `DEAL_PRICE` enum value stays, unused).
- The buyer's handover account, payment details and transaction ids never appear in event, notification or preview bodies.
- Nothing pushed or deployed without the owner's explicit request.
- Copy: plain, short, says what the person must do. Buttons for Safest steps 6 and 7 read exactly "Paid" and "Received" (the client's words).

## Rulings (my calls, the client did not answer these)

- Fastest steps 2 and 4 are the **seller's** clicks: on YouTube only the owner can add a manager or move primary ownership. The agent guides in chat, checks, and releases. — cost if wrong: two actor swaps in the template plus copy.
- Fastest hold length = the platform's `holdDays`; YouTube's becomes **7** (client's number). Safest hold = Google's owner wait (`OWNER_WAIT_DAYS`, YouTube 7, others 0).
- No proof field on "Paid": the clicks are timestamped (client: "Yahi proof hai"); the step's help asks the buyer to put the transaction id or a screenshot in the chat.
- No auto-dispute and no buyer-pays deadline: the buyer or seller opens a dispute; staff decide (client step 8).
- Safest stays available on every platform.
- In-flight deals created under the old templates cannot continue under the new ones: a script lists them so the owner can check before deploying.

## Review Focus

1. A Fastest seller completing step 4 (primary handover) while the hold is still running — must be refused (`on-hold`), and the panel/timeline must not offer the button.
2. A Safest channel returned to the seller after the seller pressed "Received" — must be refused (`already-paid`): the seller would keep both.
3. A Safest deal completed by staff from a dispute — pays nobody the price (Channel Adda never held it) and books only the fee.
4. The hold-ended sweep running twice, or on a disputed/terminal deal — announces once, never on a paused or finished deal.
5. A paid `DEAL_PRICE` invoice arriving after this change — credited to the buyer's balance, never lost and never starting anything.

---

### Task 1: Templates, transitions, holds, fees, waits (pure)

**Files:** `src/lib/deal-templates.ts`, `deal-machine.ts`, `holds.ts`, `fees.ts`, `deal-waits.ts`, `src/data/platforms.tsx` (YouTube holdDays 7), and their tests.

- Safest steps: 1 Pay the admin fee (buyer) · 2 Add the agent as manager (seller) · 3 Confirm manager access (agent, `startsHold`) · 4 Make the agent primary owner (seller) · 5 Confirm primary ownership (agent → IN_CUSTODY) · 6 Pay the seller (buyer) · 7 Confirm the payment arrived (seller → AWAITING_HANDOVER) · 8 Make the buyer the owner (agent, `handsOver`, `usesHandover`, `needsApprovalAbove`) · 9 Confirm ownership received (buyer → COMPLETED).
- Fastest steps: 1 Pay the full amount (buyer) · 2 Add the buyer as manager (seller, `usesHandover`) · 3 Confirm manager access (buyer → AWAITING_HANDOVER, `startsHold`) · 4 Make the buyer primary owner (seller, `handsOver`) · 5 Confirm primary ownership (buyer → AWAITING_RELEASE) · 6 Release the seller's funds (agent → COMPLETED, `needsApprovalAbove`).
- `byPayment` and `priceStepFor` go. Transitions: Safest IN_CUSTODY→AWAITING_HANDOVER (seller), AWAITING_HANDOVER→COMPLETED (buyer); Fastest AGENT_VERIFYING→AWAITING_HANDOVER (buyer). Remove the Safest price transitions.
- `requiredHold` Safest = fee only; `orderAmounts` Safest seller fee 0.
- `activeWait`: a running `holdUntil` is the wait; label by mode ("Google's N-day wait ends" / "Holding period ends"). `holdDaysFor(mode, platform)` exported from `deal-waits.ts`.

### Task 2: Engine

**Files:** `src/server/deals.ts`, `src/test/deal-steps.ts`, `src/test/db.ts`, integration tests.

- `STEP_TIMESTAMP`: Safest 5 custodyAt, 6 buyerPaidAt, 7 sellerConfirmedAt, 9 handoverAt; Fastest 5 handoverAt.
- `advanceStep`: any step refused `on-hold` while `holdUntil > now`; a `startsHold` step sets `holdUntil` (none when the length is 0) and posts `hold-started`.
- `resolveDeal`: restore `already-paid` (RETURNED_TO_SELLER once sellerConfirmedAt). `price-not-paid` now means the buyer has not marked it paid.
- `handoverStillOpen` uses `usesHandover`. Remove `recordPricePayment`, `recordManualPricePayment`, `safestPriceStep`; a paid `DEAL_PRICE` invoice is credited to the buyer's balance.

### Task 3: Payments off the Safest price

**Files:** `src/server/actions/payments.ts`, `wallet.ts`, `invoices.ts`, `src/app/api/webhooks/cryptomus/route.ts`, `src/server/actions/deals.ts`, admin deals page, `admin-money.ts`, tests.

### Task 4: Hold-ended sweep

**Files:** migration `20261020140000_order_hold_notified`, `prisma/schema.prisma` (`Order.holdNotifiedAt`), `src/server/deals.ts` (`announceEndedHolds`), cron route, `deal-notify.ts` (no turn notice while a hold runs), `chat-events.ts` (`hold-ended`), tests.

### Task 5: Deal UI and staff screens

`deal-status.ts` (labels, sentences, per-step overrides, money note, step help by mode), `deal-timeline.tsx` (confirm labels incl. "Paid"/"Received", hold line), `deal-panel.ts`, deal page, `pay-now.tsx`, `dispute-case.tsx`, `vocab.tsx`, `stuck-deals.tsx`, admin money copy, dashboard/wallet copy, `turnEmail`.

### Task 6: Site copy

`src/data/site.ts`, `legal.ts`, `help.ts`, home `how-it-works.tsx`, `seller-cta.tsx`, sell, fees, browse, how-it-works, trust-safety pages, `start-deal.tsx`, `buy-panel.tsx`.

### Task 7: Deploy check, verification, review

`scripts/deals-in-flight.ts` + `pnpm deals:in-flight`; full suite, tsc, biome, production build; screenshots of the deal chat for both modes; fresh reviewer; one fix pass.
