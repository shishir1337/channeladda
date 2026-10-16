# Agent custody and the two deal modes

Phase 1 of the Channel Adda build-out. Design agreed with the project owner
(via the developer) on 2026-10-16/17.

## Why this phase is first

`Order`, `TransferStep`, `LedgerEntry`, `Withdrawal`, `Dispute` and `Review`
already exist in `prisma/schema.prisma` and **nothing writes to any of them**.
There is no checkout action, no payment client and no webhook route. The deal
is therefore not a feature to be added to a working marketplace — it is the
missing half of the product, and every other request (wallet, chat deal
buttons, admin notifications) hangs off it.

## The model

Channel Adda runs two deal modes with **mirror-image protections**. A Channel
Adda agent — a human staff member, not a third party — is the pivot in both.
There is no separate agent charge; the admin fee covers their work.

|                          | Safest                                  | Fastest                            |
| ------------------------ | --------------------------------------- | ---------------------------------- |
| What is escrowed         | The **channel** (agent owns it)         | The **money** (platform holds it)  |
| Buyer pays platform      | Admin fee only                          | Channel price + admin fee          |
| Channel price route      | Buyer to seller, direct                 | Buyer to platform to seller wallet |
| Ownership transfers      | **2** (seller to agent, agent to buyer) | **1** (seller to buyer)            |
| If the buyer never pays  | Agent returns channel to seller         | Platform refunds; it holds funds   |
| If the transfer fails    | Agent still holds it; nothing lost      | Platform refunds                   |

Worked example, 100 USD channel at a 3% buyer fee:

- **Safest** — buyer pays the platform 3 USD to open the deal, then pays the
  seller 100 USD directly while the agent holds the channel. Platform keeps
  3 USD and never touches the 100 USD.
- **Fastest** — buyer pays the platform 103 USD up front. On completion the
  platform credits the seller's wallet with 100 USD and keeps 3 USD.

### Payment ordering in Safest is load-bearing

The buyer pays the seller **between** the two ownership transfers, never after
both. If payment came last, the buyer would already own the channel and the
agent would hold nothing: the seller would have surrendered the asset with no
leverage and the platform would have no stake. Paying while the agent holds
custody means neither side can be cheated.

## Constraint: ownership cannot be verified by API

The YouTube Data API does not expose channel ownership. `channels.list` returns
snippet, statistics, status and contentDetails; Brand Account owner and manager
lists live at the Google Account level and have no public API. Instagram,
Telegram, Facebook and websites have no transfer API at all — see
`src/data/platforms.tsx:78`.

**Therefore every hold completes when the agent confirms it, not when a timer
fires.** The seven days is Google's waiting period, shown to users as an
estimate and never enforced as a gate. The agent records completion and may
attach a screenshot via the existing `TransferStep.proofUrl`.

This removes the scheduler from Phase 1's critical path. Reminders, the 24-hour
auto-advance and offer expiry still need one; they are Phase 2.

## Data model changes

### New and changed enums

```prisma
enum UserRole {
  USER
  AGENT        // NEW: takes custody of assets and runs transfers
  MODERATOR
  FINANCE
  SUPERADMIN
}

// Replaces CheckoutMode { QUICK, ESCROW }. Free to rename: nothing writes
// orders yet, so there are no rows to migrate.
enum DealMode {
  SAFEST       // asset escrow, 2 transfers, buyer pays seller direct
  FASTEST      // money escrow, 1 transfer, platform pays seller
}

enum OrderStatus {
  AWAITING_PAYMENT        // both:    buyer owes the opening payment
  AGENT_VERIFYING         // fastest: agent checking channel matches listing
  AWAITING_CUSTODY        // safest:  seller must hand ownership to the agent
  IN_CUSTODY              // safest:  agent holds it, buyer inspecting
  AWAITING_BUYER_PAYMENT  // safest:  buyer owes the seller directly
  AWAITING_HANDOVER       // both:    final ownership transfer under way
  AWAITING_RELEASE        // fastest: buyer has access, seller's funds not yet paid
  COMPLETED
  PAYMENT_EXPIRED
  CANCELLED               // before any custody
  RETURNED_TO_SELLER      // safest:  buyer never paid
  REFUNDED                // fastest: platform returned the funds
  DISPUTED
}

enum LedgerKind {
  ESCROW_HOLD
  ESCROW_RELEASE
  SELLER_FEE
  BUYER_FEE
  REFUND
  WITHDRAWAL
  ADJUSTMENT
  DEPOSIT                 // NEW: wallet top-up (used in the wallet phase)
}
```

### `Order` additions

```prisma
mode DealMode @default(SAFEST)       // was: mode CheckoutMode

agentId    String?                   // assigned staff member
agent      User?   @relation("OrderAgent", fields: [agentId], references: [id])
/// The Google account the seller invites. Shown to the seller with agentBrand.
agentEmail String?
/// Display name shown next to agentEmail, e.g. "Channel Adda Transfers".
agentBrand String?

feePaidAt         DateTime?          // opening payment cleared
custodyAt         DateTime?          // safest: agent confirmed it owns the channel
buyerPaidAt       DateTime?          // safest: buyer says they paid the seller
/// On-chain reference the buyer supplies at the direct-payment step, so a
/// dispute has something checkable rather than one party's word.
buyerPaymentRef   String?
sellerConfirmedAt DateTime?          // safest: seller says the money arrived
handoverAt        DateTime?          // final transfer confirmed by the agent

@@index([agentId, status])
```

`totalUsd` keeps its meaning — what the buyer owes the platform — but is now
mode-dependent: `buyerFeeUsd` alone for Safest, `priceUsd + buyerFeeUsd` for
Fastest. `holdUntil`, `confirmedAt` and `revenueRiskAcceptedAt` stay as they
are. `paymentRef` and `paymentAsset` continue to describe the opening payment
to the platform; `buyerPaymentRef` is specifically the buyer-to-seller leg.

### `TransferStep` addition

```prisma
/// Set when a second staff member signed off a step that required it.
approvedById String?
approvedBy   User?   @relation("StepApprover", fields: [approvedById], references: [id])
```

### `PlatformSettings` additions

```prisma
/// Buyer fee per mode. Both default to 3%; the owner may diverge later
/// without a migration, because orders store amounts and not rates.
buyerFeeBpSafest  Int @default(300)
buyerFeeBpFastest Int @default(300)
/// Deducted from a Fastest sale before the seller is credited. Starts at zero:
/// a Safest sale cannot be charged a seller fee, because the money never
/// passes through the platform.
sellerFeeBp       Int @default(0)
/// How many Safest channels one agent may hold at once.
maxHoldsPerAgent  Int @default(10)
/// At or above this price, the final handover needs a second staff approval.
secondApprovalAboveUsd Int @default(500000)
```

`buyerFeeBp` is replaced by the two per-mode fields. `escrowRequiredAboveUsd`
is removed: mode is now the buyer's choice, not a price threshold.
`src/lib/fees.ts` grows a `mode` argument on `quote`, `buyerTotal` and
`orderAmounts`; `sellerPayout` applies only to Fastest.

## Step templates

Steps are seeded into `TransferStep` from a per-mode template when the opening
payment clears. The template lives in code (`src/server/deal-templates.ts`), so
a third mode later is a new template rather than a migration.

### Safest

| # | Actor  | Label                               | Advances when                   |
|---|--------|-------------------------------------|---------------------------------|
| 1 | buyer  | Pay the admin fee                   | opening payment recorded        |
| 2 | seller | Invite the agent as channel owner   | seller marks the invite sent    |
| 3 | agent  | Accept and confirm custody          | agent confirms, optional proof  |
| 4 | agent  | Hold 1 complete, ownership verified | agent confirms (Google's wait)  |
| 5 | buyer  | Inspect the channel                 | buyer confirms it matches       |
| 6 | buyer  | Pay the seller directly             | buyer submits `buyerPaymentRef` |
| 7 | seller | Confirm the payment arrived         | seller confirms                 |
| 8 | agent  | Transfer ownership to the buyer     | agent initiates                 |
| 9 | agent  | Hold 2 complete, ownership verified | agent confirms, order COMPLETED |

### Fastest

| # | Actor  | Label                                  | Advances when                 |
|---|--------|----------------------------------------|-------------------------------|
| 1 | buyer  | Pay the full amount                    | opening payment recorded      |
| 2 | seller | Invite the agent as manager            | seller marks the invite sent  |
| 3 | agent  | Verify the channel matches the listing | agent confirms                |
| 4 | seller | Promote the buyer to primary owner     | seller marks it done          |
| 5 | buyer  | Confirm access received                | buyer confirms (Google's wait)|
| 6 | agent  | Release the seller's funds             | agent releases, order COMPLETED |

Step 6 is where `secondApprovalAboveUsd` applies in Fastest; step 8 is where it
applies in Safest. The same rule guards whichever step hands value to the other
side.

## Status transitions

```
SAFEST   AWAITING_PAYMENT ──fee cleared──▶ AWAITING_CUSTODY
         AWAITING_CUSTODY ──agent confirms custody──▶ IN_CUSTODY
         IN_CUSTODY ──buyer confirms inspection──▶ AWAITING_BUYER_PAYMENT
         AWAITING_BUYER_PAYMENT ──seller confirms receipt──▶ AWAITING_HANDOVER
         AWAITING_HANDOVER ──agent confirms hold 2──▶ COMPLETED

FASTEST  AWAITING_PAYMENT ──payment cleared──▶ AGENT_VERIFYING
         AGENT_VERIFYING ──agent verifies──▶ AWAITING_HANDOVER
         AWAITING_HANDOVER ──buyer confirms access──▶ AWAITING_RELEASE
         AWAITING_RELEASE ──agent releases the seller's funds──▶ COMPLETED

BOTH     AWAITING_PAYMENT ──expiry──▶ PAYMENT_EXPIRED
         AWAITING_PAYMENT ──either side──▶ CANCELLED
         any step ──either side or staff──▶ DISPUTED

SAFEST   AWAITING_BUYER_PAYMENT ──buyer walks──▶ RETURNED_TO_SELLER
                                                 (agent hands the channel back;
                                                  buyer forfeits the admin fee)
FASTEST  AGENT_VERIFYING | AWAITING_HANDOVER | AWAITING_RELEASE ──failure──▶ REFUNDED
```

Transitions are enforced in one place, `src/server/deals.ts`, as a table of
allowed `(mode, from, to, actor)` tuples. A step cannot be completed by the
wrong party, out of order, or on a terminal order.

## Money and the ledger

The rule, stated once so it is not rediscovered as a bug: **a user's balance is
`SUM(LedgerEntry.amountUsd) WHERE userId = <id>`.** Rows describing platform
revenue or platform-held funds carry `userId: null` and are never counted into
anyone's balance.

Safest, on fee payment:

- `{ userId: null, kind: BUYER_FEE, amount: +buyerFeeUsd, orderId }`

The 100 USD is deliberately absent. It never moves through the platform, so
inventing a ledger row for it would make the ledger lie. It is recorded on the
order as `buyerPaidAt` and `buyerPaymentRef`.

Fastest, on payment:

- `{ userId: null, kind: ESCROW_HOLD, amount: +totalUsd, orderId }`

Fastest, on completion:

- `{ userId: seller, kind: ESCROW_RELEASE, amount: +priceUsd, orderId }`
- `{ userId: seller, kind: SELLER_FEE, amount: -sellerFeeUsd, orderId }` (omitted while the rate is zero)
- `{ userId: null, kind: BUYER_FEE, amount: +buyerFeeUsd, orderId }`

Fastest, on refund:

- `{ userId: null, kind: REFUND, amount: -totalUsd, orderId }`

## Agent safeguards

Because a Safest agent genuinely owns other people's channels:

- **Concurrency cap.** Assignment fails if the agent already holds
  `maxHoldsPerAgent` Safest orders in `AWAITING_CUSTODY`, `IN_CUSTODY`,
  `AWAITING_BUYER_PAYMENT` or `AWAITING_HANDOVER`. Google limits how many
  channels one account may own, and a locked or phished agent account freezes
  every deal it holds.
- **Second approval.** Above `secondApprovalAboveUsd`, the step that hands
  value across requires a second staff member, recorded in
  `TransferStep.approvedById`. A single compromised agent cannot misdirect a
  channel.
- **Full audit.** Every status change and step completion writes an `AuditLog`
  row via `recordAudit`, entity `"order"`.

`recordAudit` currently types `actorId` as required while the column is
nullable. Phase 1 widens the helper to `actorId: string | null` so
system-initiated transitions (payment cleared, expiry) are recorded rather than
silently skipped.

## Admin activity feed

The owner asked to see every deal start and every transaction in the admin
panel. Rather than fan a `Notification` row out to each staff member, the admin
feed is a query over `AuditLog` filtered to `entity = "order"`, joined to the
order and its listing, newest first, at `/admin/deals`. `AuditLog` is already
indexed on `[entity, entityId]`; a `@@index([entity, createdAt])` is added for
the feed's ordering.

Buyers, sellers and agents still get per-user `Notification` rows on the events
that need their action, using the existing `NotificationKind.ORDER`.

## Scope boundary

In Phase 1:

- the schema changes above, with migrations
- `src/server/deals.ts`: creation, the transition table, step advancement
- `src/server/deal-templates.ts`: the two templates
- `src/server/actions/deals.ts`: one server action per actor-facing step
- agent assignment, the concurrency cap and second approval
- the admin fee settings surface: `src/server/settings.ts`,
  `src/server/actions/settings.ts` and `src/components/admin/settings-form.tsx`
  gain the per-mode buyer fees, `maxHoldsPerAgent` and
  `secondApprovalAboveUsd`, and lose `escrowRequiredAboveUsd`
- `/admin/deals` activity feed; agent queue at `/admin/deals?agent=me`
- the buy panel choosing a mode, and the order timeline both sides see

Explicitly **not** in Phase 1, with the seam each one plugs into:

- **Cryptomus payment** — `recordOpeningPayment(orderId, ref, asset)` is called
  by an admin action for now and by the webhook in Phase 2.
- **Scheduler** — reminders, the 24-hour auto-advance and `PAYMENT_EXPIRED`
  sweeping are Phase 2. Expiry is evaluated on read until then, the way
  `src/server/offers.ts:29` already treats stale offers.
- **Wallet top-ups and withdrawals** — the seller's balance becomes derivable
  in Phase 1; depositing and withdrawing are the wallet phase.
- **Per-mode copy** — the escrow language in `src/data/legal.ts`,
  `src/components/listing/buy-panel.tsx`, `src/components/auth/auth-shell.tsx`
  and ~25 other files is accurate for Fastest and false for Safest. Phase 3.
- **Relaying the seller's payment details** — see Open questions.

## Error handling and edge cases

- **Opening payment arrives twice.** `recordOpeningPayment` is idempotent on
  `paymentRef`; a second call with the same reference is a no-op.
- **Buyer claims paid, seller denies it.** `buyerPaymentRef` gives staff an
  on-chain reference to check. Unresolved, it becomes a `Dispute`; the agent
  still holds the channel, so the outcome is enforceable — release to the buyer
  or return to the seller.
- **Seller never invites the agent.** The order sits in `AWAITING_CUSTODY`;
  nothing has moved except the admin fee. Staff may cancel and refund that fee.
- **Agent leaves or is suspended while holding channels.** Reassignment moves
  `agentId` and appends a step for the new agent to confirm custody. A
  suspended agent's orders are listed on `/admin/deals` as needing reassignment.
- **Listing sold twice.** Creating a deal moves the listing to
  `ListingStatus.RESERVED`; a second attempt is rejected.
- **Monetization lost during custody.** Accepted risk, no special handling, per
  the owner. `Order.revenueRiskAcceptedAt` already records the buyer's
  acknowledgement.
- **Non-YouTube platforms.** One shared flow for all five, per the owner.
  `Listing.transferProfile` and `platforms.transferSteps` already carry the
  platform-specific wording shown to users; per-platform divergence comes later.

## Testing

- **Transition table** — unit tests over `(mode, from, to, actor)`: every legal
  transition succeeds, and a representative illegal one per state is rejected.
  Wrong actor, out of order, and terminal-order cases included.
- **Template seeding** — a Safest order gets nine steps with the right actors;
  a Fastest order gets six.
- **Fee arithmetic** — `orderAmounts` for both modes at prices that expose
  rounding (99 USD at 3% is 2.97, not 3), and a Safest order's `totalUsd`
  equals the fee alone.
- **Ledger** — after a completed Fastest deal the seller's derived balance is
  exactly `priceUsd - sellerFeeUsd`, and no row for the channel price exists on
  a completed Safest deal.
- **Safeguards** — assignment past `maxHoldsPerAgent` fails; a handover above
  `secondApprovalAboveUsd` fails without `approvedById`.
- **Idempotency** — `recordOpeningPayment` twice with one reference yields one
  fee ledger row.

## Open questions for the owner

1. **How does the buyer learn where to send the money in Safest?** The product
   strips contact details from every message (`Message.redactedAt`), so the
   seller cannot simply post a wallet address. The proposal is a structured
   payment-details block the agent publishes into the thread, exempt from
   redaction and recorded in the audit log. Without a deliberate mechanism,
   buyers will ask for a WhatsApp number and the deal leaves the platform.
2. **Who picks the mode, and is Safest offered on every listing?** Assumed the
   buyer chooses freely at checkout.
3. **What is the admin fee actually set to per mode?** Both default to 3%;
   Fastest is more work and carries the funds, so it may warrant more.
4. **Does the 24-hour auto-advance apply to any step other than the Fastest
   agent-verification step?** Assumed not.

None of these block Phase 1: each has a stated default, and question 1 affects
the chat phase rather than the state machine.

## Success criteria

- A Safest deal can be driven end to end — nine steps, two agent-confirmed
  holds, buyer-to-seller payment recorded between them — leaving the listing
  `SOLD`, the order `COMPLETED`, one `BUYER_FEE` ledger row and no row for the
  channel price.
- A Fastest deal can be driven end to end, leaving the seller with a derived
  balance equal to the price less the seller fee.
- A buyer who abandons a Safest deal at the payment step leaves the order
  `RETURNED_TO_SELLER`, the listing `LIVE` again and the admin fee kept.
- Every transition in both runs appears on `/admin/deals`.
- No transition can be performed by the wrong party or out of order.
