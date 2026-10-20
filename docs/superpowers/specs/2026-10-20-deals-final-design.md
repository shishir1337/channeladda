# Both deals as the owner set them out, and the browser-run fixes

On 2026-10-20 the owner pasted the final process for each deal type. They
replace the flows built from the client's first correction. This note records
how each process maps onto deal steps, the decisions taken where the process
was silent, and the fixes for what a full buyer/seller/agent/admin run in the
browser found the same day.

## Fastest

The owner's process:

1. Combined fee paid (channel cost + escrow fee), held by the escrow agent.
2. The seller sends an owner invite to the escrow agent.
3. The escrow agent receives the owner invite and sends an owner/manager invite
   to the buyer. The 7-day holding period starts.
4. Primary ownership received by the escrow agent: the deal is complete for
   the seller, and the seller is paid.
5. Primary ownership transferred to the buyer: the full deal is complete.

| # | Actor | Label | Effect |
|---|---|---|---|
| 1 | buyer | Pay the full amount | Recorded by the system. Status `AGENT_VERIFYING`. |
| 2 | seller | Invite the agent as owner | Needs an agent on the deal. |
| 3 | agent | Invite the buyer as owner | Uses the buyer's handover account. Starts the hold. Status `AWAITING_HANDOVER`. |
| 4 | seller | Make the agent primary owner | Opens when the hold ends. |
| 5 | agent | Confirm primary ownership | Stamps `custodyAt`. **Pays the seller.** Status `IN_CUSTODY`. Second approval above the threshold. |
| 6 | agent | Make the buyer primary owner | Hands the channel over. Stamps `handoverAt`. Status `COMPLETED`. Second approval above the threshold. |

Step 4 is the seller's: on YouTube only a primary owner can transfer primary
ownership, and a new owner must wait 7 days first. The agent becomes an owner
at step 3, together with the buyer, so the agent's own 7 days run inside the
holding period.

## Safest

The owner's process: pay the escrow fee; the seller grants the escrow agent
manager/owner access; the mandatory 7-day holding period; the escrow agent
verifies ownership, monetization, strikes and authenticity, and the buyer
receives the latest proof; the buyer pays the full price directly to the
seller; once the seller confirms the payment, the escrow agent transfers full
ownership to the buyer.

| # | Actor | Label | Effect |
|---|---|---|---|
| 1 | buyer | Pay the admin fee | Recorded by the system. Status `AWAITING_CUSTODY`. |
| 2 | seller | Invite the agent as owner | Needs an agent on the deal. |
| 3 | agent | Accept the owner invite | Starts Google's 7-day wait (YouTube only). |
| 4 | seller | Make the agent primary owner | Opens when the wait ends. |
| 5 | agent | Verify the channel | Ownership, monetization, strikes, authenticity; the latest proof goes in the deal chat. Stamps `custodyAt`. Status `IN_CUSTODY`. |
| 6 | buyer | Pay the seller | Paid directly, to the details the seller gave on the deal. Stamps `buyerPaidAt`. |
| 7 | seller | Confirm the payment arrived | Received. Stamps `sellerConfirmedAt`. Status `AWAITING_HANDOVER`. |
| 8 | agent | Transfer ownership to the buyer | Uses and hands over the buyer's account. Stamps `handoverAt`. Status `COMPLETED`. Second approval above the threshold. |

Step 4 is not in the owner's list, but the agent has to be primary owner to
transfer ownership at step 8, which YouTube allows only after the 7 days.

## In both modes

- The buyer presses nothing after paying, in line with the owner's two
  processes, which end with the agent's transfer. A buyer with a problem
  raises it in the chat or as a dispute.
- Our agent's custody and final transfer ask "are you sure" first, as Paid and
  Received already did.
- The seller never sees the buyer's handover account: only our agent uses it.
- A step that needs an agent is refused (`no-agent`) while none is assigned.
  The seller sees "Channel Adda is assigning an agent" instead of a button.
  Every agent or moderator whose level covers the deal, and the superadmin,
  is notified that it needs an agent, and the seller is not told it is their
  move.
- Agents own the channel in both modes, so Fastest deals count toward
  `maxHoldsPerAgent`.
- Step text depends on the platform: only YouTube deals mention a Google
  account or Google's wait.

## Money on Fastest

- The whole amount is held from step 1 until step 5.
- At step 5 the hold is settled exactly as completion settled it before:
  released, the seller credited the price, our fee and any seller fee booked.
  `requiredHold` is 0 for a Fastest deal once `custodyAt` is set.
- Completion at step 6 marks the listing sold and moves no money. One
  settlement routine runs at both points and settles only what is still held,
  so nothing can be paid twice.
- After step 5 a Fastest deal cannot be refunded or cancelled: the seller has
  been paid. A dispute raised then can only be decided as completed, and
  deciding a Fastest dispute as completed needs `custodyAt`.
- The seller is told when they are paid, by notification and email. The chat
  gets a line saying the seller has been paid, with no amount.

## Where the Safest buyer pays the seller

Restored from the deal-chat design, section 5, which was removed in c6af3d6
when the Safest price briefly went through Channel Adda, and not brought back
when it went back to the seller. The browser run showed why it is needed: the
chat removed the seller's bKash number as a phone number and flagged the
conversation.

- The seller writes "Where Rafi should pay you" on the deal: free text, up to
  500 characters, not run through the contact filter, links refused.
- The buyer sees it from their turn to pay (after step 5); the seller, our
  agent and staff always.
- Every save is a chat line (never the details), an audit entry, and — once
  the buyer can see it — a notification and email to the buyer. It locks
  when the buyer presses Paid.
- A seller who has said nothing is reminded once, when our agent verifies the
  channel.

## The other findings from the browser run

- Dollar amounts keep their cents at any size; converted currencies stay whole
  above 100.
- Signing in with email lands on the dashboard, as Google sign-in did.
- The overview lists deals waiting on the reader, in any role.
- Agents get a "Deal desk" link in the site menu.
- A sold listing is no longer linked from its chat or deal page.
- Payout addresses are checked against the chosen network's format.
- "Ask the seller a question" opens an editable question instead of sending a
  fixed one.
- Small ones: the reserved-listing note, the withdraw hint below the minimum,
  the member's email in the balance-correction URL, the platform buttons'
  accessible names, the seller's warning shown to the agent, and the step
  button that ran out of the chat panel.

## Open

- The non-YouTube handover checklists (Instagram, Facebook, Telegram, website)
  still describe the seller handing over to the buyer directly; both processes
  are written for YouTube.
- The scheduled sweep has to be set up on the server.
