# Safest deals: the buyer pays Channel Adda, never the seller

**Status:** proposed on 2026-10-18 and waiting for the owner's answers to the
four questions in "Decisions for the owner". Every *(call)* is open for the
owner to overrule.
**Date:** 2026-10-18
**Builds on:** `2026-10-17-agent-custody-design.md` (the two deal modes and the
agent) and `2026-10-18-deal-chat-design.md` (which added the "where to pay me"
field this design removes).

## Why

The owner's words, after running a Safest deal end to end in the browser:

> "why seller needs to give the wallet address here and buyer needs to payment
> on his wallet instead of paying here? he can send the payment and seller can
> refuse that he didnot get the money … for solving these kinds of scam
> problems we added the wallet features right? so that buyer can pay the
> seller and that amount added in sellers channel adda's wallet right not his
> personal wallet … no personal transactions beetween each other buyers can
> pay from cryptomus directly and it will add in sellers wallet or also if
> buyer already have amount in his wallet then he can use that funds"

The rule that follows: **no money ever moves directly between a buyer and a
seller.** The buyer pays Channel Adda, by Cryptomus or from their Channel Adda
balance, and the seller is paid into their Channel Adda wallet. Withdrawing to
a personal wallet is a separate step that the seller takes, through the payout
queue that already exists.

## What we got wrong

These are the design mistakes in the Safest flow as it was built, found by
reading the code after the walkthrough.

1. **We sent the buyer to pay the seller outside the platform.** At step 6 the
   buyer paid the price to an address the seller typed in. Our own Trust &
   Safety page tells people that paying crypto to someone's wallet outside the
   platform is how scams work.
2. **The seller's word was the only proof of payment.** The seller pressed
   "The money has arrived" to move the deal on. A seller could say they were
   never paid, and a buyer could claim to have paid. Staff had a pasted
   transaction reference and nothing else to check.
3. **We could never give the buyer their money back.** The price never reached
   our books, so a disputed Safest deal could return the channel to the seller
   but could not refund the buyer. `REFUNDED` was impossible for Safest.
4. **A personal payment address was shown to the other party.** That exposed
   the seller's wallet. It also gave both sides a ready-made way to take their
   next deal off the platform.
5. **A buyer could inspect the channel and never pay.** Nothing timed out after
   the inspection step. The seller's channel could sit with our agent
   indefinitely, and it kept counting against that agent's limit.
6. **The numbers counted money we never saw.**
   - The seller's dashboard showed "Earned from sales" for Safest prices that
     never passed through us.
   - The buyer's "Spent" figure added those prices too.
   - The wallet never showed a Safest sale at all.
7. **The last Safest step had no second approval.** On Fastest, the step that
   releases money needs a second staff member above $5,000. On Safest, the step
   that completed the deal had no such check.
8. **Copy promised what the code didn't do.**
   - **Promises the new design reverses:** the Terms, the Refund policy, the
     FAQ, the Help centre, the fees page and every deal screen said "Channel
     Adda never holds the price". This design makes that sentence false, and
     each of these pages has to change.
   - **Promises that were never built:**
     - Trust & Safety says a seller cannot withdraw money held with us during a
       dispute. No such lock exists.
     - The Help centre promises partial settlements. No code path produces one.
     - The staff desk says the admin fee is not returned when a channel goes
       back to the seller. It is returned, if the agent had not yet taken
       custody.

## The new Safest deal

Safest stays the slow, careful mode: our agent takes ownership of the channel
and passes it to the buyer. Two things change:

- the money now goes through Channel Adda as well;
- the seller is paid into their Channel Adda wallet.

### Recommended: the buyer pays the price and the fee up front

| # | Step | Who | Deal status after |
|---|------|-----|-------------------|
| 1 | Pay the price and the fee | buyer (by Cryptomus or from balance) | Awaiting custody |
| 2 | Invite the agent as channel owner | seller | |
| 3 | Accept and confirm custody | agent | |
| 4 | Hold 1 complete, ownership verified | agent | In custody |
| 5 | Inspect the channel | buyer | Awaiting handover |
| 6 | Transfer ownership to the buyer | agent, second approval above the threshold | |
| 7 | Hold 2 complete, ownership verified | agent, second approval above the threshold | Completed, and the seller is paid |

Why up front rather than after the inspection:

- **The seller is protected before giving anything up.** The seller hands the
  channel to our agent only after the buyer's money is already held by
  Channel Adda. A buyer can no longer inspect the channel and walk away while
  the seller's channel sits in Google's waiting periods.
- **The buyer is still fully protected.** The money is held by us, not paid to
  the seller. If the channel does not reach the buyer, they get it back.
- **One payment instead of two.** That means one checkout and one crypto
  network fee. Two steps disappear (9 become 7), and so does the "inspected
  but never paid" dead end. Deals can still stall in other places; see
  "Deals that stall".
- **It reuses the escrow that Fastest already runs**, which is tested and
  reconciled on the money desk. A second payment stage would add new code to
  every payment path: invoices, webhook, reconciliation, balance payment,
  manual recording, and underpayment and late-payment credit. Each of those is
  a place for a money bug.

The alternative, which keeps a separate price step after the inspection, is
described in "Decisions for the owner".

### Where the money is at each moment

The ledger already has the right entries. Safest now writes the same entries
Fastest has always written.

| Moment | Ledger | What people see |
|--------|--------|-----------------|
| Buyer pays by Cryptomus | platform `ESCROW_HOLD` +price+fee | Buyer: "Paid, held by Channel Adda". Seller: "The buyer's payment is held by Channel Adda, so you can invite our agent." |
| Buyer pays from balance | buyer `ESCROW_HOLD` −total, platform `ESCROW_HOLD` +total | The same, and the buyer's wallet shows "Paid into deal CA-…" |
| While the deal runs | nothing new | Seller's wallet, under **Held for your sales**: "$X from CA-…, paid by the buyer, moves to your balance when the transfer completes". This amount cannot be withdrawn yet. |
| Completed (step 7) | platform `ESCROW_RELEASE` −total, seller `ESCROW_RELEASE` +price, platform `BUYER_FEE` +fee, and the `SELLER_FEE` pair if a seller fee applies | Seller's balance goes up and can be withdrawn through the existing payout queue |
| Channel returned to the seller *before* our agent had custody | `REFUND` pair, price+fee | Buyer's balance gets everything back |
| Channel returned to the seller *after* custody | `REFUND` pair for the price. The fee is kept as income: platform `ESCROW_RELEASE` −fee, then `BUYER_FEE` +fee | Buyer's balance gets the price back. The fee pays for the agent's work, as /fees already says. |
| Cancelled before custody | `REFUND` pair, price+fee (nothing moves on an unpaid deal) | Buyer's balance gets everything back |

**The invariant, the same one Fastest already checks:**

- The platform's own position on an order is:
  - on a completed deal, the buyer fee plus any seller fee;
  - on a deal returned after custody, the buyer fee;
  - on a deal returned or cancelled before custody, zero.
- The money desk's "held for buyers" figure is the sum of live paid deals, now
  for both modes.
- The month's revenue is the `BUYER_FEE` and `SELLER_FEE` rows. Refunding held
  money is not lost revenue: until now, every Safest `REFUND` was subtracted as
  a returned fee, which would show a $10,000 return as −$10,000 of income.
- **Before any money moves:** completion and every refund first check that the
  platform's hold on the order equals the order's `totalUsd`. If it doesn't,
  they refuse, and the deal shows on the staff desk instead of writing rows
  that don't net. This is the guard against an order whose books don't match
  its amounts, such as an old fee-only order.

### When the seller can withdraw

**Recommended: when the deal completes.** The price shows in the seller's
wallet from the moment the buyer pays, under **Held for your sales**. It moves
to the withdrawable balance at step 7, once the buyer is the channel's owner.

That is what makes a refund possible: until the buyer has the channel, the
money is still ours to give back.

There is no further waiting period after a Safest deal completes *(call)*. The
seller left the channel at Hold 1, two Google waiting periods before the money
is released, so Fastest's 14-day recovery hold has nothing to protect against
here.

### Paying from the balance

- **If the balance covers the total**, "Pay from your balance" works as it does
  today, at the larger amount.
- **If the balance is short but not empty**, the payment panel says so: "You
  have $1,000. Add $4,150 to pay from your balance." The button tops the
  wallet up by exactly the shortfall through the existing top-up. The balance
  then covers the deal, and the buyer pays from it. *(call)*
- **If the shortfall is above the $10,000 top-up limit**, the panel offers the
  direct Cryptomus payment only.
- Splitting one payment between the balance and an invoice is out of scope.

### Second approvals

- Step 6, the transfer, keeps its second approval above the threshold
  (`secondApprovalAboveUsd`, $5,000 by default).
- Step 7 gains one, because it releases the price. This matches Fastest, where
  the release step already has one.

### Deals that stall

A paid deal can stall in two places, now with the whole price held:

- **The seller never invites the agent** (Awaiting custody, step 2 open).
- **The buyer never inspects** (In custody, step 5 open).

**Recommended for now: staff unstick them.** The **Stuck deals** desk already
lists every live deal and flags it at 3 and 7 days. From there, finance
cancels the deal (full refund) or returns the channel (price refunded, fee
kept). Automatic timers can follow once real deals show how long these steps
take. The alternative is in "Decisions for the owner".

### Holes this closes on the way

These existed already, but they could only lose a fee. With the whole price on
our books they could lose a channel's worth of money, so they are fixed as part
of this change.

- **A payment recorded by hand and also by Cryptomus was credited twice.**
  "Payment received" names the payment by the deal reference, while Cryptomus
  names it by the invoice reference. If both arrived, the second was booked to
  the buyer's balance as a fresh payment. The fix: "Payment received" is
  refused while the deal has a checkout invoice that is not dead, and on a deal
  that is already paid. A late payment on a closed deal is credited only once
  per invoice.
- **A refund made in Cryptomus could be paid again into the balance.** A
  processor refund freezes the deal as disputed. Returning or cancelling it
  then also credited the buyer's balance. The fix: when a processor refund is
  on record, the outcome writes only the platform's side ("Refunded by the
  processor") and credits nobody.

### What goes away

- The **"Where to pay me"** card and field, with its chat event, buyer
  notification, seller reminder and email. The `sellerPayTo*` columns go too.
- **"Pay the seller directly"** and the transaction-reference box.
- **"Confirm the payment arrived"**, the seller's step, and every guard keyed
  on it. The `buyerPaymentRef`, `buyerPaidAt` and `sellerConfirmedAt` columns
  go.
- The `AWAITING_BUYER_PAYMENT` status is no longer reachable. The value stays
  in the database enum, because Postgres cannot drop an enum value cleanly, and
  a comment in the schema says it is retired.

### Guards that change meaning

- **Returning the channel needs a dispute first once the buyer has approved
  the inspection** (new `inspectedAt`, stamped by step 5). This replaces the
  old `buyerPaidAt` rule and still applies after the agent starts the transfer
  (`handoverAt`, stamped by step 6). If Google's second transfer fails, finance
  can still return the channel from a dispute and refund the price, so "if the
  channel does not reach you, you get the money back" stays true until the
  deal completes.
- **The "seller has confirmed payment" guard goes**, along with the step it
  was keyed on.
- **Returning or cancelling a paid Safest deal now moves platform money**, so
  it needs the Finance role (or superadmin), exactly like a refund. The staff
  desk's "Finance only" badge and its outcome warnings follow the same rule.

### Fees

- Safest totals become **price + buyer fee**, as on Fastest. The buyer fee rate
  is still the Safest rate (`buyerFeeBpSafest`).
- The seller fee setting applies to both modes *(call)*. It is 0% by default,
  so nothing changes until finance sets a rate.

### Deals that already exist

Nothing is live: `main` has never been deployed, and every deal in the
databases is test data.

**Recommended: a clean switch.** The migration closes every Safest deal that
is still running, with the note "Closed when Safest moved to on-platform
payment":

- a deal whose agent never took custody becomes **Cancelled**;
- a deal whose agent has taken custody becomes **Returned to seller**, because
  a deal in custody cannot be cancelled;
- the listing goes back on sale;
- whatever the platform held for the deal, the fee at most, goes back to the
  buyer's balance;
- the timestamps the desks read are stamped.

It also re-labels old fee rows so the widened money desk adds up:

- On old Safest deals that were later refunded, the fee taken at payment is
  re-labelled from `BUYER_FEE` to `ESCROW_HOLD`. Under the new rule a refunded
  fee was never income.
- Finished deals and fees that were kept stay as they are.

This runs before any other part of the change, so no old fee-only order ever
meets the new completion code.

This keeps a single Safest flow in the code instead of two forever. It applies
when the owner runs `pnpm db:migrate` on the dev database, so the test deals
there are closed too.

## Words on the site

Every sentence listed in the research (`src/app/(site)`, `data/site.ts`,
`data/help.ts`, `data/legal.ts`, the home components, the listing and
buy panels, deal status and timeline, pay panel, wallet, dashboard, emails,
admin vocabulary and desks) is rewritten to the new rule. These are the
replacement lines; each page adapts them:

- **Safest:** "Our agent takes ownership of the channel and passes it to you.
  You pay Channel Adda up front. We hold the money until the channel is yours,
  then pay the seller."
- **Fastest:** "The seller hands the channel to you directly while our agent
  watches. We hold your payment through a 14-day safety period, then pay the
  seller."
- **Both:** "You never pay a seller directly. If anyone asks you to, it is a
  scam. Report it."

**Legal text** (Terms, Refund policy): I draft the changes and mark them in
the summary. They change what Channel Adda promises to hold and refund, so the
owner must read them before this ships.

**Promises that were never built:**

- **Trust & Safety, "can't withdraw during a dispute":** this becomes true for
  held money, because a held price is never in the seller's withdrawable
  balance until release. The line is reworded to say exactly that.
- **Help, "partial settlements":** the line is removed.
- **Staff desk, "fee not returned on a return":** corrected to the real rule.

A test fails the build if any banned phrase reappears in `src`. The banned
phrases are "pay the seller directly", "never holds the price", "off-platform"
and "paid direct".

## Decisions for the owner

1. **When does the buyer pay the price?**
   - **Up front, with the fee (recommended).** Reasons above.
   - **After the inspection, as a second payment.** The buyer pays only the fee
     first, then the price once they have seen the channel in our hands. It is
     credited to the seller's held balance either way. This option costs:
     - a second checkout and network fee for the buyer;
     - a second payment stage through every payment path;
     - a new time limit, after which an unpaid deal returns the channel to the
       seller and the fee is kept;
     - nine steps instead of seven.
2. **When can the seller withdraw?**
   - **At completion (recommended).**
   - **The moment the buyer pays.** We then cannot refund the buyer if the
     transfer fails.
3. **A paid deal that stalls:**
   - **Staff unstick it from the Stuck deals desk (recommended for now).**
   - Automatic timers:
     - if the seller hasn't invited the agent within 3 days of payment, the
       deal is cancelled and the buyer is refunded in full;
     - if the buyer hasn't inspected within 3 days of custody, the channel is
       returned and the price refunded.
4. **Test deals that are mid-way when this lands:**
   - **Close them and return the fee (recommended, since nothing is live).**
   - Keep the old flow alive for them. This is only worth it if a real deal is
     running somewhere.

## Not in this change

- Splitting one payment between balance and Cryptomus.
- Partial settlements and the unused `Dispute` model.
- KYC before withdrawal.
- Automatic payouts through a processor API (finance still sends by hand).
- A per-deal option for staff to refund the fee on a return after custody. The
  existing rule stands: the fee is kept once the agent has held the channel.

## Calls I made

- No waiting period after a Safest completion (see "When the seller can
  withdraw").
- "Top up the difference" for a short balance, rather than a split payment.
- Step 7 gains a second approval above the threshold, as well as step 6.
- `inspectedAt` is a new column, rather than reusing `buyerPaidAt` under a
  misleading name.
- The seller fee setting applies to Safest as well as Fastest. It is 0% today,
  so nothing changes until finance sets a rate. Until now it was forced to zero
  only because the price never passed through us.
- Fastest sellers get the same **Held for your sales** wallet section. It is
  the same data, and the screen was missing it for them too.
