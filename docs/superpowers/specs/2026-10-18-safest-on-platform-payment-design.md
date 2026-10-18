# Safest deals: the buyer pays Channel Adda, never the seller

**Status:** decided by the owner on 2026-10-18. Every *(call)* is open for the
owner to overrule.
**Date:** 2026-10-18
**Builds on:**
- `2026-10-17-agent-custody-design.md`: the two deal modes and the agent.
- `2026-10-18-deal-chat-design.md`: added the "where to pay me" field, which
  this design removes.

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

And when asked whether the price should move to the start:

> "first buyer pays the admin fee to start the deal and channel adda agent join
> in the process then after first 7 days period and channel's access now in
> hand of channel adda then the channel's payment comes … current website flow
> is also same like we have just instead of custom personal transaction it will
> be go through wallet … only in fastest deal buyer pay the full amount in
> start"

The rule that follows: **no money ever moves directly between a buyer and a
seller.**
- The Safest steps stay as they are: the fee first, then the price once our
  agent holds the channel.
- The price is paid to Channel Adda, by Cryptomus or from the buyer's balance,
  and it lands in the seller's Channel Adda wallet.
- Withdrawing to a personal wallet is a separate step the seller takes, through
  the payout queue that already exists.

## What we got wrong

These are the design mistakes in the Safest flow as built, found by reading the
code after the walkthrough.

1. **We sent the buyer to pay the seller outside the platform.** At step 6 the
   buyer paid the price to an address the seller had typed in. Our own Trust &
   Safety page says paying crypto to someone's wallet outside the platform is a
   scam.
2. **The seller's word was the only proof of payment.** The seller pressed "The
   money has arrived" to move the deal on. A seller could say they were never
   paid, and a buyer could claim to have paid. Staff had a pasted transaction
   reference and nothing else to check.
3. **We could never give the buyer their money back.** The price never reached
   our books. A disputed Safest deal could return the channel to the seller,
   but it could not refund the buyer. `REFUNDED` was impossible for Safest.
4. **A personal payment address was shown to the other party.** That exposed
   the seller's wallet, and it gave both sides a ready-made way to take their
   next deal off the platform.
5. **The numbers counted money we never saw.**
   - The seller's dashboard showed "Earned from sales" for Safest prices that
     never passed through us.
   - The wallet never showed a Safest sale.
6. **The last Safest step had no second approval.** The step that completed the
   deal had none, while Fastest's release step needs a second staff member
   above $5,000.
7. **The copy promised what the code didn't do.**
   - The Terms, the Refund policy, the FAQ, the Help centre, the fees page and
     every deal screen said "Channel Adda never holds the price". That becomes
     untrue now.
   - Some promises were never built at all:
     - Trust & Safety says a seller cannot withdraw money held with us during a
       dispute. No such lock exists.
     - The Help centre promises partial settlements. No code path produces one.
     - The staff desk says the admin fee is not returned when a channel goes
       back to the seller, but it is returned before custody.
8. **Two money holes were small only because we held so little.** Both are
   fixed here.
   - **A payment recorded by hand and also by Cryptomus was credited twice.**
   - **A refund made in Cryptomus could be paid again into the balance.**

## The Safest deal, paid through Channel Adda

| # | Step | Who | Deal status after |
|---|------|-----|-------------------|
| 1 | Pay the admin fee | buyer, by Cryptomus or from balance | Awaiting custody |
| 2 | Invite the agent as channel owner | seller | |
| 3 | Accept and confirm custody | agent | |
| 4 | Hold 1 complete, ownership verified | agent | In custody |
| 5 | Inspect the channel | buyer | Awaiting the price |
| 6 | Pay the price to Channel Adda | buyer, by Cryptomus or from balance; the payment itself completes the step | Awaiting handover |
| 7 | Transfer ownership to the buyer | agent; second approval above the threshold | |
| 8 | Hold 2 complete, ownership verified | agent; second approval above the threshold | Completed, and the seller is paid |

What changed from today:

- **Step 6** used to be "Pay the seller directly" with a typed transaction
  reference. Now it is a real payment to us, and the system completes the step
  when the money arrives. The buyer cannot mark it done by hand.
- **Old step 7, "Confirm the payment arrived" (seller), is gone.** There is
  nothing for the seller to confirm: we saw the money.
- **Step 8 gains a second approval above the threshold**
  (`secondApprovalAboveUsd`, $5,000 by default), because it now releases the
  price. Step 7 keeps the one it has.

Fastest is unchanged: the buyer pays the price and fee at the start.

### Where the money is at each moment

Both modes now follow one rule: **everything a buyer pays is held, and only
becomes ours or the seller's when it is earned.**

| Moment | Ledger | What people see |
|--------|--------|-----------------|
| Buyer pays the fee (step 1) | platform `ESCROW_HOLD` +fee. From balance, also buyer `ESCROW_HOLD` −fee. | The deal starts. |
| Buyer pays the price (step 6) | platform `ESCROW_HOLD` +price. From balance, also buyer `ESCROW_HOLD` −price. | **Buyer:** "Paid, held by Channel Adda". **Seller:** under *Held for your sales*, "$X from CA-…, paid by the buyer, moves to your balance when the transfer completes". It cannot be withdrawn yet. |
| Completed (step 8) | platform `ESCROW_RELEASE` −(price+fee); seller `ESCROW_RELEASE` +price; platform `BUYER_FEE` +fee; and the `SELLER_FEE` pair if a seller fee applies | The seller's balance goes up and can be withdrawn through the payout queue. |
| Cancelled before custody | `REFUND` pair for everything held (the fee) | The buyer's balance gets the fee back. |
| Returned to the seller after custody, before the price was paid | fee kept: platform `ESCROW_RELEASE` −fee, `BUYER_FEE` +fee | Nothing comes back. The fee pays for the agent's work, as /fees already says. |
| Returned to the seller after the price was paid | `REFUND` pair for the price; fee kept as above | The buyer's balance gets the price back. |

**Why Safest's fee is now held at payment, not taken as income:**

- A fee refunded before custody stops counting as lost revenue.
- A price refund is never mistaken for one. Until now, every Safest `REFUND`
  was subtracted from revenue as a returned fee, which would have shown a
  $10,000 price refund as −$10,000 of income.
- The money desk's revenue is now the `BUYER_FEE` and `SELLER_FEE` rows, in
  both modes.

**The invariant:**
- The platform's position on an order is:
  - on a completed deal, the buyer fee plus any seller fee;
  - on a deal returned after custody, the buyer fee;
  - on a deal cancelled before custody, zero.
- "Held for buyers" on the money desk is the sum of live paid deals, in both
  modes.

**Before any money moves**, completion and every refund check that the
platform's hold on the order equals what it should be:
- Fastest: price + fee.
- Safest: the fee, plus the price once step 6 has been paid.

If the hold is wrong, the move is refused and the deal is flagged for staff,
instead of writing rows that don't net.

### Paying the price

The price is a second payment on the same deal. Unlike the opening payment, it
has to be built:

- **Kept apart from the opening payment.** Each invoice is marked for the fee
  or for the price, with a new invoice purpose `DEAL_PRICE`. The price is
  recorded under its own reference, `buyerPaymentRef`, which is now set by the
  system and never typed.
  - Today a second payment on a paid deal is treated as an accidental extra and
    booked to the buyer's balance. That rule now applies per stage.
- **Checked against its own amount.** Underpayment checks compare what was paid
  with that invoice's amount. Today the opening payment is compared with the
  order's total, and for Safest that total is the fee alone.
- **A price that arrives late,** after the deal was closed, is credited to the
  buyer's balance at the amount the invoice was for.
- **Every way in works:** Cryptomus, the buyer's balance, and staff recording
  "Price received" by hand when it arrived some other way. Recording it by hand
  is finance-only, and it is refused while a price invoice is still open.

### Paying from the balance

This applies to both payments, the fee and the price.

- **If the balance covers it,** "Pay from your balance" works as it does today.
- **If the balance is short but not empty,** the panel says so: "You have
  $1,000. Add $4,150 to pay from your balance." Its button tops the wallet up
  by exactly the shortfall through the existing top-up, after which the buyer
  pays from the balance. *(call)*
- **If the shortfall is above the $10,000 top-up limit,** the panel offers the
  direct Cryptomus payment only.
- Splitting one payment between the balance and an invoice is out of scope.

### When the seller can withdraw

**When the deal completes** (owner's decision). The price appears in the
seller's wallet under *Held for your sales* from the moment the buyer pays it.
It moves to the withdrawable balance at step 8, once the buyer owns the
channel. Until then we can still refund the buyer.

There is no further waiting period after a Safest completion *(call)*. The
seller left the channel at Hold 1, two Google waiting periods before release,
so Fastest's 14-day recovery hold has nothing to guard here.

### Deals that stall

**Staff unstick them from the Stuck deals desk** (owner's decision). That desk
already lists every live deal and flags it at 3 and 7 days. The places a paid
Safest deal can stall:

- **The seller never invites the agent.** Finance cancels, and the fee is
  refunded.
- **The buyer never inspects, or inspects and never pays the price.** Finance
  returns the channel. The fee is kept, because custody was reached.

No automatic timers in this change.

### Guards

- **Returning the channel needs a dispute first once the price has been paid**
  (`buyerPaidAt`, now stamped by the system when the price arrives). This holds
  after the agent starts the transfer (`handoverAt`) as well. If Google's
  second transfer fails, finance can still return the channel from a dispute
  and refund the price. So "if the channel does not reach you, you get the
  money back" stays true until the deal completes.
- **The "seller has confirmed payment" guard goes** with the step it was keyed
  on.
- **Returning or cancelling a paid Safest deal moves platform money,** so it
  needs the Finance role (or superadmin), exactly like a refund. The staff
  desk's "Finance only" badge and outcome warnings follow the same rule.

### What goes away

- **The "Where to pay me" card and field,** with its chat event, buyer
  notification, seller reminder and email. The `sellerPayTo*` columns are
  dropped.
- **The transaction-reference box** on step 6.
- **"Confirm the payment arrived"** and `sellerConfirmedAt`.
- `buyerPaidAt` and `buyerPaymentRef` stay, now written by the system when the
  price arrives.

### Fees

- **The buyer fee is unchanged:** a Safest buyer still pays the fee up front,
  at the Safest rate.
- **The seller fee setting now applies to Safest as well** *(call)*. It is 0%
  today, so nothing changes until finance sets a rate. It used to be forced to
  zero only because the price never passed through us.

### Deals that already exist

Nothing is live: `main` has never been deployed, and every deal in the
databases is test data. **The migration closes every Safest deal that is still
running** (owner's decision), with the note "Closed when Safest moved to
on-platform payment":

- A deal whose agent never took custody becomes **Cancelled**.
- A deal whose agent did becomes **Returned to seller**, because a deal in
  custody cannot be cancelled.
- The listing goes back on sale.
- Whatever the platform held, the fee at most, goes back to the buyer's
  balance.
- The timestamps the desks read are stamped.

It also re-labels the fee on old Safest deals that were refunded: what was
taken at payment becomes `ESCROW_HOLD` instead of `BUYER_FEE`, because under the
new rule a refunded fee was never income. Finished deals, and fees that were
kept, are left as they are.

The migration runs first, so no old deal ever meets the new code. It applies to
the owner's dev database when `pnpm db:migrate` is run there.

## Words on the site

Every sentence the research lists is rewritten to the new rule. The research
covers `src/app/(site)`, `data/site.ts`, `data/help.ts`, `data/legal.ts`, the
home components, the listing and buy panels, deal status and timeline, the pay
panel, wallet, dashboard, emails, and the admin vocabulary and desks. The lines
each page adapts:

- **Safest:** "You pay our fee to start. Once our agent owns the channel and
  you have inspected it, you pay the price, to Channel Adda, never to the
  seller. We hold it until the channel is yours, then pay the seller."
- **Fastest:** "You pay the price and our fee at the start. The seller hands
  the channel to you directly while our agent watches, and we hold your
  payment through a 14-day safety period, then pay the seller."
- **Both:** "You never pay a seller directly. If anyone asks you to, it is a
  scam. Report it."

**Legal text** (Terms, Refund policy): I draft the changes and list them in the
summary. They change what Channel Adda promises to hold and refund, so the
owner must read them before this ships.

**Promises that were never built:**
- Trust & Safety's "can't withdraw during a dispute" becomes true for held
  money, because a held price never reaches the seller's withdrawable balance
  until release. It is reworded to say exactly that.
- The Help centre's partial-settlement line is removed.
- The desk's fee-return line is corrected.

A test fails the build if the old promise reappears anywhere in `src`. The
banned phrasing is "pay the seller directly", "never holds the price",
"payment … off-platform", "paid direct", and "price never passes".
Moderation copy about taking deals off the platform stays allowed.

## Not in this change

- Splitting one payment between balance and Cryptomus.
- Automatic timers for stalled deals.
- Partial settlements and the unused `Dispute` model.
- KYC before withdrawal.
- Automatic payouts through a processor API. Finance still sends by hand.
- A per-deal option for staff to refund the fee after custody.

## Calls I made

- No waiting period after a Safest completion.
- "Top up the difference" for a short balance, rather than a split payment.
- A second approval on step 8 as well as step 7.
- The seller fee setting applies to both modes (0% today).
- Safest's fee is held at payment and becomes income at completion or when
  kept, the way Fastest's already does.
- Fastest sellers get the same *Held for your sales* wallet section. It is the
  same data, and the screen was missing it for them too.
- Inspection (step 5) and payment (step 6) stay separate steps, as today, so
  the buyer approves the channel before being asked for money.
