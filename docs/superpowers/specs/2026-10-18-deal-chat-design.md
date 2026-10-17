# Deal chat: negotiate and run the deal from the conversation

**Status:** approved to build on 2026-10-18 ("ok do it"). Every *(call)* stays
open for the owner to overrule.
**Date:** 2026-10-18
**Builds on:** `2026-10-17-agent-custody-design.md` (the two deal modes and the agent)

## Why

Today a buyer and a seller talk in **Dashboard → Messages**, but everything that
moves the deal happens somewhere else:

- the offer is made in a box on the listing page;
- it is answered on the Offers page;
- the deal is started back on the listing page;
- it is paid for and run on the deal page.

So after every message someone has to leave the conversation, find the right
page and come back. The owner wants the conversation to be the place where it
all happens, so that talking turns into buying with as little friction as
possible:

> "in message part there can be also these things so that conversation
> increased / easy ux dont need to leave chat for the deal can be also do all
> things buyer seller agents from the chat itself"

## What the owner decided

- **Everything that works today keeps working.** The listing page, the Offers
  page and the deal page stay. The chat is an additional place to do the same
  things, not a replacement. ("they can do like what we have now, but also can
  do directly from that page as well")
- **Buyers, sellers and agents** can all act from the chat.
- **They do not have to be online at the same time.** The chat works
  asynchronously; notifications bring people back to it.
- **Every other decision was handed to the builder** ("its on you"). The calls
  made on that basis are marked *(call)* below, so the owner can overrule any of
  them.

## Goals

1. A buyer can go from first question to a paid, running deal **without leaving
   the conversation**: ask, make an offer, accept a counter, choose Safest or
   Fastest, pay.
2. A seller can answer offers, put their own price on the table, and do every
   seller step of the deal from the conversation.
3. The assigned agent joins the conversation of their deal, can talk to both
   sides there, and can do their steps from it.
4. The conversation is the readable record of the deal. Every offer, answer and
   deal step appears in it at the moment it happened, whichever page it was done
   from.
5. On a Safest deal, the buyer can see where to pay the seller.

## Non-goals

- Real-time sockets, typing indicators, read receipts, push notifications or a
  mobile app. A short refresh interval is enough (see *Keeping the chat
  current*).
- Any change to the deal rules: steps, order, fees, holds, who may do what,
  money handling. The chat calls the same server functions the pages call.
- Removing or redesigning the listing, Offers or deal pages beyond adding links
  to the chat.
- Letting a seller start a conversation with a buyer who never contacted them.
- Deciding the Fastest recovery hold (14 days on YouTube) — that question is
  open separately with the owner.
- Translations.
- Per-thread status badges in the conversation list (e.g. "offer waiting").
  Useful, but not needed for the goals; a later change.

## Anti-goals (it fails even if it works)

- A button in the chat that skips, reorders or bypasses a deal step, or that
  succeeds where the same action on a page would be refused.
- The chat leaking contact details more than today. Every new piece of text a
  user can put in front of the other side goes through the same filter as a
  chat message, except the one deliberate exception (*Where to pay the seller*).
- The chat and a page showing two different truths about the same offer or
  deal.
- A buyer paying the wrong account because the seller's payment details changed
  without anyone noticing.
- An agent reading a conversation that is not about a deal they are assigned
  to.

## What exists today (verified in the code)

- **One conversation per buyer per listing** (`Conversation @@unique([listingId,
  buyerId])`). Only a buyer can open one ("Ask the seller a question"); it
  starts with a canned question from the buyer.
- **Messages are text plus an optional photo or clip.** Phone numbers, emails,
  links and messaging handles are removed on the way in
  (`src/lib/redact.ts`); attempts flag the thread for staff. Staff post as
  "Channel Adda", anonymously.
- **The page never refreshes by itself.** A reply only appears when the reader
  reloads or navigates.
- **Agents cannot open conversations at all.** `src/server/messages.ts` and
  `src/server/upload-access.ts` admit buyer, seller and the staff roles
  MODERATOR, FINANCE, SUPERADMIN. The second file says why: an agent is staff
  "for the deals they are assigned to, not for the platform". This design keeps
  that principle and grants exactly that.
- **Offers** (`src/server/offers.ts`): one open offer per buyer per listing,
  in either direction; a counter closes the old offer and opens a new one;
  accepting reserves the listing and rejects everyone else's open offers;
  offers lapse after `offerExpiryHours` (48); an accepted offer holds the
  listing for `paymentWindowHours` (48) for the buyer to open the deal.
- **A deal is linked to the conversation** when it is created
  (`Conversation.orderId`, unique). Chat retention keeps a linked thread's
  messages, and keeps its media until the deal ends.

### Problems found while reading, fixed by this work

1. **A counter-offer notifies nobody.** `counterOffer` never calls
   `tellTheOtherSide`, so a buyer whose offer was countered is not told.
2. **The note on an offer skips the contact filter.** `createOffer` and
   `counterOffer` store `message` as typed, so "call me on 017…" reaches the
   other side unredacted.
3. **A second deal on the same conversation is never linked to it.**
   `Conversation.orderId` is unique and only filled when empty. If a buyer's
   first deal lapses unpaid and they open another, the second deal has no
   conversation: the dispute page says "No conversation is linked to this
   deal", and the thread's media is purged during the live deal because the
   linked (first) order is finished.
4. **Offers auto-rejected because someone else bought the listing** change
   status silently: the other buyers are never told.
5. **Finishing a deal through its last step notifies nobody.**
   `notifyNextActor` returns early when no step is left
   (`deal-notify.ts:91-92`), and `notifyDealEnded` is only called when staff
   resolve a deal.
6. **A deal whose payment window lapses notifies nobody**
   (`expireStale` in `deals.ts`).
7. **Paying the deal from the wallet balance never tells the next person it is
   their move** — the Cryptomus path does, the balance path does not.

## The design

### 1. The conversation becomes a timeline of messages and events

A conversation shows three kinds of entries, in the order they happened:

| Kind | Example | Who it is from |
|---|---|---|
| **Message** | "Is the revenue steady?" | buyer, seller, agent or staff |
| **Offer card** | "Rafi offered $2,000" with its note and its live state | whoever made it |
| **Event line** | "Nadia accepted $2,200", "Payment received — the deal is under way", "Hold 1 complete" | the person who acted, or the system |

- **Offer cards show live state** (open, accepted, countered, declined,
  withdrawn, expired, time left). They read the `Offer` row, so the card, the
  Offers page and the listing page can never disagree. While an offer is open,
  its card carries **Accept / Counter / Decline** for the person whose turn it
  is, and **Withdraw** for the person who made it.
- **Event lines are history.** They are written once, when the thing happens,
  and never change. They do not carry buttons: the action for "now" lives in
  the deal panel (section 2).
- **Events are written by the server function that makes the change, inside the
  same transaction** — `createOffer`, `counterOffer`, `acceptOffer`,
  `declineOffer`, `withdrawOffer`, the expiry sweeps, `createDeal`, payment
  recording, agent assignment, `advanceStep`, ending a deal, saving payment
  details. So the record is the same whichever page the action came from, and a
  change that rolls back takes its event with it.
  **One exception:** a change made inside a Serializable transaction whose
  failure is reported to the person as a business refusal — today
  `assignAgent` ("cap reached") and paying from the balance ("not enough
  balance") — writes its event straight after the transaction commits, not
  inside it. Otherwise a chat message landing at the same moment could tell
  staff an agent is at their cap, or a buyer they cannot afford the deal. The
  cost is that a crash between the commit and the event loses one event line;
  the deal's own rows and the audit log still hold the truth.
- **The offer-expiry sweep writes one event per offer it expires.** It becomes
  a per-offer compare-and-set rather than one bulk update, and stays safe to
  run twice at once. The card itself shows "expired" the moment the time
  passes, whether or not the sweep has run, as offers already do.
- **An offer or a deal always has a conversation.** Making an offer from the
  listing page, or opening a deal straight from the listing page, creates the
  conversation if there is none. A conversation created this way starts with
  that offer card or that event, not with the canned "Hi — I'm interested"
  question.
- **The text of an event is safe to show anywhere** — the conversation list
  preview, notifications, emails. It never contains payment details, agent
  emails or anything else that is shown to only one side.

Event lines to write (wording is the builder's, in the product's plain style):
offer made, price proposed by the seller, countered, accepted, declined,
withdrawn, expired, declined because the listing was reserved for someone else,
accepted offer lapsed unopened, deal opened (mode and price), payment received,
deal payment lapsed, agent joined, agent changed, each completed step,
recovery hold started (with its end date), payment details added or changed,
dispute raised, deal ended (each outcome).

### 2. The deal panel: "what can I do now?"

At the top of every conversation sits **one panel** that answers what the
person reading can do next. It is the chat's equivalent of the deal page's
"Your move" card and follows the same rule: **one action on screen at a time**.

It is worked out by **one pure function** from: who is reading (buyer, seller,
agent, staff), the listing's status, the latest offer in this conversation,
whether the buyer holds an accepted offer, the newest deal in this conversation
and its steps, and whether staff closed the thread. Pure, so every state can be
tested without a database.

**Buyer**

| Situation | Panel |
|---|---|
| Listing on sale, nothing open | **Buy for $2,500** (opens the Safest/Fastest choice) and **Make an offer** |
| Buyer's offer waiting on the seller | "Your offer of $2,000 is with Nadia · 31h left" · Withdraw |
| Seller's price or counter waiting on the buyer | "Nadia offered $2,200" · Accept / Counter / Decline (same as its card) |
| Buyer holds an accepted offer, no deal yet | "$2,200 is held for you for 46h" · the Safest/Fastest choice, amounts, the revenue-risk box, **Start the deal** |
| Deal awaiting the opening payment | The pay card (balance or crypto), as on the deal page |
| Deal running | The deal's next step, as on the deal page, with its button when it is the buyer's move |
| Deal finished | Its outcome, and a link to the deal page |
| Listing reserved for someone else, sold, paused or removed | One line saying so; no buttons |

**Seller**

| Situation | Panel |
|---|---|
| Listing on sale, nothing open | **Offer Rafi a price** *(new, see section 3)* |
| Buyer's offer or counter waiting on the seller | Accept / Counter / Decline |
| Seller's price waiting on the buyer | "Your price of $2,200 is with Rafi · 40h left" · Withdraw |
| Buyer holds the accepted offer, no deal yet | "Waiting for Rafi to start the deal · 46h left" |
| Deal awaiting payment | "Waiting for Rafi to pay" |
| Deal running | The next step with its button when it is the seller's move; the agent's invite email when the step needs it; on Safest, the payment-details box (section 5) |
| Deal finished | Its outcome |

**Agent:** the next step of the deal, with its button when it is the agent's
move — including the same second-approver choice the deal page shows on agent
steps (the server decides whether it is required). Otherwise who it is waiting
on.

**Staff:** a read-only line (status, whose move) and a link to the deal page
(`/dashboard/deals/[id]`, which is where staff open deals today). Staff
moderation controls stay where they are.

How it looks *(call)*:

- **Phone:** the panel collapses to one line at the top of the conversation
  ("Your move: Pay $66 ›", "Waiting on Nadia"). Tapping it opens the full card.
  It starts open when it is the reader's move, closed otherwise.
- **Computer:** the same panel, open, above the messages.
- **The composer** gets a second button beside "Photo or clip": **Make an
  offer** for the buyer, **Offer a price** for the seller, shown only when that
  is currently allowed.

The panel **reuses the existing components** — the Safest/Fastest chooser
(`StartDeal`), the pay card (`PayNow`), the next-step card (`DealNextStep`), the
dispute link (`RaiseDispute`) and the offer card's buttons — rather than
rebuilding them, so one fix reaches both places. Each component may need to
accept a "where am I" prop for its links and its after-success navigation;
none may change what it allows.

### 3. Offers from the chat

- **Buyer: Make an offer** — amount and optional note, the same rules as the
  listing page (signed in, verified email, at least half the asking price, one
  open offer at a time, listing on sale).
- **Seller: Offer a price** *(call — new)* — the seller puts a price to this
  buyer, who can accept, counter or decline it. Stored as an `Offer` with
  `bySeller: true`, so it follows every existing rule: one open offer per buyer
  per listing in either direction, the 48-hour expiry, accepting reserves the
  listing. Extra rules: it must be **below the asking price** (at the asking
  price the buyer can simply buy) and at least half of it; and only in a
  conversation the buyer started.
  *Why:* without it, a seller who writes "I can do $2,200" makes the buyer type
  that offer so the seller can accept it — two extra steps for both.
- **Withdraw** works for whoever made the open offer, the seller included
  *(call — today only buyers can)*.
- **Notes on offers go through the contact filter** and flag the thread, exactly
  like a chat message (fixes problem 2, on every page).
- **Everyone who should hear, hears** — counter, decline, accept, withdraw,
  auto-decline because the listing went to someone else — with a notification
  that opens the conversation at that offer (fixes problems 1 and 4). Offers
  made, countered, proposed, accepted and declined also email, as offers that
  are made, accepted and declined do today. Withdrawals and auto-declines do
  not email *(call)*.
- **The Offers page stays** as the list of every offer, and each card gains an
  "Open the chat" link. The listing page's offer box stays; after sending it
  shows "Open the chat" beside "Track it in your offers".
- On the Offers page, a seller's own price shows as "their price", not "their
  counter".

### 4. The deal from the chat

- **Start:** from the panel, using the existing `startDeal`. The price is the
  held accepted offer if the buyer has one, otherwise the asking price — exactly
  as `createDeal` decides today.
- **Pay:** the pay card in the panel. After paying by crypto, Cryptomus sends
  the buyer back to **the conversation**, whichever page they paid from
  *(call)*. It cannot depend on where they started: pressing Pay again reuses
  the invoice that is still open, and Cryptomus keeps the return address of the
  first request. The conversation shows the payment arriving and the next step;
  the deal page is one click away. (The `?paid=1` the deal page is sent today
  is read by nothing.)
- **Steps:** every buyer, seller and agent step can be done from the panel,
  with the same component, the same checks, and the same extra fields (the
  buyer's transaction reference on Safest, the agent's second approver).
- **Disputes:** "Something is wrong with this deal" is available from the panel,
  as on the deal page.
- **Notifications** for "your move" and deal outcomes open the conversation
  instead of the deal page *(call)*. The panel there has the same action, and
  the deal page is one click away from it. Three notifications that do not
  exist today are added (problems 5–7): the deal finished (buyer, seller and
  agent), the deal's payment window lapsed (buyer and seller), and "your move"
  after paying from the balance.
- **The deal page stays** and gains an "Open the deal chat" link. The
  conversation header gains the deal reference, its status, and a link to the
  deal page.
- **One conversation, many deals over time.** If a deal lapses and the buyer
  opens another, both belong to the same conversation; the panel follows the
  newest one, and the older one stays as history in the timeline (fixes
  problem 3).

### 5. Where to pay the seller (Safest only)

On a Safest deal the buyer pays the seller directly (step 6). Today nothing
tells the buyer where, and the chat cannot: the filter removes bank account
numbers (they look like phone numbers) and links.

- **The seller fills in "Where Rafi should pay you"** — free text, up to 500
  characters, e.g. a USDT address and network, or bank details. *(Call.)* The
  agent-custody design proposed instead that the agent publish these details
  into the thread. The seller entering them is chosen because the agent would
  have to get them from the seller somehow — and the chat cannot carry them,
  which is the whole problem — so the agent would add a relay and a delay but
  no check: an agent cannot verify that a crypto address belongs to the
  seller. The protection against a hijacked seller account is instead that
  changes are loud and the details lock (below).
- **The seller is prompted** from the moment the deal opens, and at the latest
  when the agent has custody. The buyer's step-6 card shows the details
  prominently with a copy button. If they are missing there, it says so and the
  seller is reminded once; the buyer's button is not blocked *(call: the agent
  may relay details another way, and a dispute covers a seller who never
  gives any)*.
- **Not run through the contact filter** — that is the point of the field —
  **but links are refused** *(call: a "payment link" is the classic way to send
  a buyer to a fake page)*.
- **Who sees it:** the seller, the agent and staff always; **the buyer only
  once it is their turn to pay the seller** (status AWAITING_BUYER_PAYMENT) and
  after. Before that the channel is not yet in custody, and the details would be
  a way to take the deal off the platform.
- **Changes are loud.** Every save writes an event ("Nadia changed where to be
  paid" — never the details themselves) and an audit entry with the old and the
  new value. A change after the buyer could see it notifies the buyer and puts a
  warning on the card: "Changed 10 minutes ago — check it with Nadia here before
  you pay."
- **Locked once the buyer records the payment.** After that it is evidence.
- **Shown on the deal page too**, with the same component and rules.
- Stored on the deal (`Order`), not on the seller's profile *(call: details
  can differ per deal, and a profile value is one more thing a hijacked account
  could change for every future deal at once)*.

### 6. The agent in the chat

- **Access:** the agent assigned to a deal can read the whole conversation it
  belongs to — including what was said before the deal, which is what they
  verify against — and its attachments, and can post in it. Same conditions as
  the deal page already uses: still an AGENT, not banned, still the assigned
  agent.
- **Only while that deal is running** *(call)*. A disputed deal counts as
  running (the agent may need to answer). When the deal ends, or the agent is
  reassigned or moves to another role, their access to the conversation ends
  at once — including to anything said afterwards about a later deal in the
  same conversation, which may have a different agent. Staff keep reading
  everything, so nothing a dispute needs is lost. One rule, shared by reading
  the thread, posting, attachment URLs and the agent's inbox.
- **Identity:** an agent's messages show their name and "Channel Adda agent".
  Agents speak as themselves; anonymous "Channel Adda" stays for staff.
- **Where they find it:** the agent's Messages inbox lists the conversations of
  their deals; the deal page and the admin deal queue link to it.
- **Agent changed mid-deal:** the event line tells the seller plainly that the
  invite email has changed, and the panel shows the new one. A seller who
  already invited the old address needs to know.
- **Each reader has their own unread state.** Today one `readAt` on each
  message serves both readers, which only works with two: with an agent in the
  thread, whichever of the buyer and seller opens it first would clear the
  agent's message as read for the other. Read state moves to one marker per
  person per conversation. A new message notifies everyone in the conversation
  except its sender — buyer, seller and the assigned agent of a running deal —
  collapsed per conversation as today. Staff are not notified; they work from
  the admin queue.
- Staff keep reading every conversation in the admin area, now with the cards
  and events (read-only) in it.

### 7. Keeping the chat current

While a conversation is open and the browser tab is visible, the page asks the
server every **5 seconds** whether anything changed, and refreshes when it has.
It stops while the tab is hidden and checks at once when the reader comes back.

The check returns a **fingerprint of everything the timeline and the panel are
drawn from**, worked out at the moment of the check: the conversation's
`lastMessageAt`, the listing's status, the latest offer's status as it reads
now (an open offer past its expiry reads as expired), and the newest deal's
status, steps and whether its recovery hold has ended. `lastMessageAt` alone is
not enough, because some changes write no event in this conversation — another
buyer reserving the listing, the seller pausing it, staff removing it, an offer
running out of time, a hold ending. The check is a handful of indexed reads,
so it stays cheap.

A card or button that was stale when pressed is still safe: the server checks
again, refuses with its usual plain message, and the page refreshes.

### 8. Rules that stay as they are

- **A closed conversation** (staff closed it) stops **free text** reaching it,
  from anywhere: no messages, and an offer whose card would land in it is
  refused if it carries a note (it goes through without one). Everything that
  is not free text still works — making, countering, accepting, declining and
  withdrawing offers, starting and paying for the deal, every deal step —
  *(call)*: closing a chat is moderation of what people say, and must not
  freeze a negotiation or a deal that has money or a channel in the air. The
  note check lives in `offers.ts`, so it holds on the listing and Offers pages
  too; it is a rule about text, not about who may do what.
- **Own listing, banned users, unverified email, listing status, payment
  window, offer expiry, reservations, the agent's channel cap, second
  approvals, recovery holds, disputes** — all enforced by the existing server
  functions, unchanged.
- **Chat retention:** messages in a conversation with any deal are kept; its
  media waits until **every** deal in it has ended. Event lines in a
  conversation that never had a deal clear after 10 days like any message; the
  offers themselves stay on the Offers page.

## Data changes

- `Message` gains a **kind** (message, offer, event) and optional references to
  the offer or deal it is about. The sender becomes optional, for events the
  system writes (payment received, lapses). System events do not make a thread
  unread; the notification that goes with them does that job.
- The deal–conversation link moves to the deal: **`Order.conversationId`**
  (many deals, one conversation), backfilled from today's
  `Conversation.orderId`, which is then dropped. Retention, the dispute page
  and `openConversation` move to the new link.
- `Order` gains the seller's payment details and when they were last changed.
- Read state moves from `Message.readAt` to one marker per person per
  conversation (part 4, when a third reader arrives).
- No backfill of events for existing offers or deals *(call: the site is not
  live, so the only data is development data; new activity creates events from
  now on)*.

## Constraints

- Next.js 16.4, React 19.3, TypeScript 7, Prisma 7.10, Better Auth 1.7, Biome
  2.5, Vitest 5. This Next.js differs from older versions: read the relevant
  guide in `node_modules/next/dist/docs/` before writing code (`AGENTS.md`).
- No new dependencies (no socket service); polling only.
- Every money and ownership rule stays in `src/server/deals.ts`,
  `src/server/offers.ts` and `src/lib/deal-machine.ts`. New code calls them; it
  never re-implements a check.
- Tests first, against the dedicated `_test` database. Migrations through
  Prisma.
- The house style: comments explain *why*, in full sentences, as in the files
  above; user-facing copy is plain, second person, no jargon.

## Delivery in four parts

Each part ships and is tested on its own.

1. **Foundation.** The data changes; events written by every offer and deal
   change; a conversation guaranteed for every offer and deal; events and
   read-only offer cards in the timeline (dashboard and admin); the 5-second
   refresh; the offer-note filter, the counter notification and the
   auto-decline notification fixes.
2. **Offers from the chat.** The composer's offer buttons, the seller's price,
   the buttons on offer cards, the panel's offer states, notifications that open
   the conversation, "Open the chat" links on the listing and Offers pages.
3. **The deal from the chat.** Start, pay (and the return to the chat), every
   buyer and seller step, the dispute link, the Safest payment details (chat
   and deal page), deal notifications opening the conversation and the three
   missing ones, the header and deal-page links.
4. **The agent in the chat.** Access to their deals' conversations and
   attachments, posting as themselves, per-reader unread state, message
   notifications to every participant, their inbox, their steps from the
   panel, the agent-changed warning.

## Cases the tests must cover

Beyond each rule above having its own test:

1. Two buyers negotiating the same listing; the seller accepts one in one
   conversation while the other buyer's card still shows Accept. The second
   press is refused with the existing message; the other buyer gets an event and
   a notification.
2. An offer expires while its card is on screen; pressing Accept is refused and
   the card shows it expired.
3. A buyer who holds an accepted offer is never offered "Buy for the asking
   price" in the panel.
4. A deal lapses unpaid and the buyer opens a second one in the same
   conversation: the panel follows the second, the dispute page finds the
   conversation for both, and media is kept while the second is running.
5. The payment-details visibility and lock rules, including a change after the
   buyer could see it.
6. An agent cannot read or post in a conversation of a deal they are not
   assigned to, or after reassignment, or after a role change, or after their
   deal has ended — through the page, the post action, the attachment URL and
   the inbox.
10. With an agent in the conversation, each of the three readers' unread state
    is their own: one person opening the thread clears nothing for the others.
11. A closed conversation refuses a message and an offer note from every page,
    while an offer without a note, an answer to an offer, starting and paying
    for the deal and every step still work.
12. A chat message landing during agent assignment or a balance payment does
    not turn either into a "cap reached" or "not enough balance" refusal.
7. A payment that clears through the webhook while the buyer has the
   conversation open shows up on the next refresh as an event and a new panel
   state.
8. An offer made from the listing page by a buyer who never chatted creates a
   conversation that starts with the offer card and shows up in the seller's
   Messages and Offers.
9. The pure panel function: every row of the three tables in section 2.

## Left to the builder

- Wording of event lines, panel copy and buttons, in the existing voice.
- Exact layout and styling, within the phone/computer rules in section 2.
- Names of new functions, columns and components.
- How the refresh check is exposed (route handler or server action).
- Whether an offer card links to the listing.
