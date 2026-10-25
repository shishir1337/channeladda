# One chat per person (buyer + seller), not per listing

The owner (2026-10-26): a buyer who buys again from the same seller should
see one conversation with that person — "we dealt before, and this is new" —
as Fiverr/Upwork do, with each listing and each deal shown as a card inside
it. Approved: the full version.

Line numbers refer to the working tree when the plan was written; re-read
before editing.

## 1. Data model (`prisma/schema.prisma`)

- **Direction:** `@@unique([buyerId, sellerId])` replaces
  `@@unique([listingId, buyerId])`. A sells to B and later B sells to A is a
  second thread: `roleInThread`, `senderOf`, offer turns and the deal panel
  all read the reader's role from `conversation.buyerId/sellerId`. The rail
  shows "Buying · …" / "Selling · …" when a reversed pair exists.
- **`Message.listingId String`** — NOT NULL once backfilled, FK to Listing
  `onDelete: Restrict`, `@@index([conversationId, listingId, createdAt])`,
  `messages` relation on Listing. Every message is about exactly one listing
  (retention, agent scoping and the contact filter depend on it).
- **`Conversation.listingId`** becomes nullable, FK `onDelete: SetNull`
  (today's Cascade would delete a whole pair thread with one listing).
  `/// Legacy: not read`; dropped in a later release. Code stops reading
  `conversation.listing`.
- **New `ConversationAlias { id String @id /* old id */, conversationId →
  Conversation (Cascade), listingId String, createdAt }`** for old URLs.
- Tables referencing Conversation: Order.conversationId, Message,
  ConversationRead. Offers reach a thread only through Message.offerId.
  AuditLog `entity="conversation"` rows stay (immutable); the alias resolves.

## 2. Migrations (three files; the data step one `DO $$…$$` block)

1. `20261027120000_pair_chat_columns` — add `Message.listingId` (nullable)
   + FK + index; create `ConversationAlias`; `Conversation.listingId`
   nullable with FK SET NULL; drop `Conversation_listingId_buyerId_key`.
2. `20261027120100_pair_chat_merge` (one DO block):
   1. backfill `Message.listingId` from its conversation, `IS NULL`-guarded;
   2. temp map old_id → new_id, survivor = oldest thread per
      (buyerId, sellerId) (`first_value(id) OVER (PARTITION BY … ORDER BY
      "createdAt", id)`), rows where old <> new;
   3. insert aliases `ON CONFLICT DO NOTHING`;
   4. repoint `Message.conversationId` and `Order.conversationId`;
   5. ConversationRead: upsert (new_id, userId) with `LEAST(readAt)`;
   6. survivor: `lastMessageAt = MAX`, `flaggedAt = MAX` + latest flagReason,
      `closedAt = MAX`, `staffId = COALESCE`; `RAISE NOTICE` counts;
   7. delete the emptied conversations (reads cascade).
   Re-runnable: a second run finds no groups.
3. `20261027120200_pair_chat_unique` — unique index
   `Conversation_buyerId_sellerId_key`; `Message.listingId SET NOT NULL`.

Old URLs: `resolveThreadAlias(id, viewer)` in messages.ts; when `getThread`
returns null on `/dashboard/messages/[id]` or `/admin/messages/[id]`,
redirect to `threadHref(new, alias.listingId)` only if `roleInThread` passes
on the target, else `notFound()`. Notification hrefs are not rewritten.

## 3. Server, by file

- `chat-events.ts`: `ensureConversation(w, {buyerId, sellerId})` upserts on
  the pair (catch P2002, read back); `pairThreadOf`; `postEvent` takes an
  optional `listingId`, else from `order.listingId` / `offer.listingId`,
  throws with neither.
- `messages.ts`: `openConversation` by pair, opener written per listing the
  first time it is discussed; `askSeller` passes listingId; `getThread`:
  `ThreadMessage.listingId`, `Thread.listings: ThreadListing[]` (id, slug,
  title, handle, priceCents, platform, sourceUrl, onSale) instead of the
  listing fields, agents get only `listingId in agentListings`;
  `sendMessage({…, listingId})` — listing must be in the thread (distinct
  Message.listingId + order listingIds), agents only their deals' listings,
  `askSeller` may add a listing of the same seller; `allowHandles` = every
  listing in the thread; `readersOf` agents only those whose running deal is
  on that listing; `unreadByThread` predicate for agents by listing;
  `listThreads`/`listStaffThreads`: `listingTitles[]`, `latestListingTitle`,
  `deals[]` (groupBy conversationId+listingId), agent previews by listing.
- `thread-access.ts`: `agentListingsOnThread(userId, conversationId)`;
  `agentOnThread` = non-empty.
- `deal-panel.ts`: `loadPanelInput(conversationId, listingId, viewer)`.
- `thread-fingerprint.ts`: every visible listing's status, latest offer and
  order; agents use their newest visible message time.
- `upload-access.ts`: agent may open a chat file only for their listing.
- `offers.ts`: `noteRefused`/`threadOf` by pair; `ensureConversation` calls
  pass `{buyerId, sellerId}`; `proposePrice(conversationId, listingId, …)` —
  listing must be the seller's and already in the thread.
- `deals.ts`, `listing-hold.ts`, `seller-listings.ts`: look up by pair;
  `seller-listings` HISTORY counts messages, not conversations.
- `chat-retention.ts`: see 5.
- `actions/messages.ts`: `postMessage(conversationId, listingId, body, key)`.
- New `src/lib/thread-href.ts`: `threadHref(id, listingId?)` →
  `/dashboard/messages/<id>?about=<listingId>`, used everywhere a thread is
  linked (deal-notify, offers, pay-to, deals, listing-hold, seller-listings,
  actions/payments, dashboard pages, offer-card, start-deal, offer-form,
  ask-seller, admin-disputes).
- `src/test/db.ts`: add `"ConversationAlias"` to TABLES before Conversation.

## 4. UI

- `src/lib/thread-focus.ts` `pickFocus({about, listings, panels, messages})`:
  a valid `?about`, else the only listing where it is the viewer's move, else
  the newest visible message's listing. Header, deal panel, StartDeal, offer
  composer and the composer chip follow it.
- `messages/[id]/page.tsx`: `searchParams.about`, alias redirect,
  `loadPanelInput` per active listing (running deal, open/held offer).
- Two deals at once: `listing-tabs.tsx` above the panel — one tab per active
  listing ("title · CA-123"), a dot where it is the viewer's move, a
  scrollable strip on a phone.
- `thread-view.tsx`: `listings` prop; `ListingDivider` ("About: <title> ·
  <price>", "View listing", "Show deal" → `?about=`) where a message's
  listing differs from the previous one; deal-opened EventLine links to
  `?about=`; composer chip "About: <title>" switching with
  `router.replace(?about=…, {scroll:false})`, static with one listing;
  `postMessage` sends the focus listing.
- `thread-rail.tsx`: subtitle (latest listing, "+N more"), `listingTitles[]`
  for the filter, `deals[]` ("CA-123 +1"), `role`; `messages/layout.tsx`.
- `offer-composer.tsx`: listingId to `proposePrice`.
- Admin `messages/[id]`, `messages`, `thread-list.tsx`: alias redirect,
  dividers, focus, subtitles; `staff-controls.tsx` copy — closing/flagging
  covers the whole conversation between the two people.

## 5. Access and retention

- Agents see messages whose listingId belongs to a running deal they hold in
  that thread; their own messages are stamped with it. One helper, used by
  getThread, previews, unread, fingerprint, uploads and readersOf.
- Media: unchanged (waits for every deal in the conversation).
- Text (`purgeOldMessages`, raw SQL): delete messages older than 10 days,
  not from staff, conversation not flagged, and NOT EXISTS an order with the
  same conversation and listing. Equivalent to today's rule after backfill.
- Flag/close apply to the whole pair. Offer notes keep `filterNote(handle)`.

## 6. Tests

Will break: chat-events, messages, deal-panel, thread-fingerprint,
agent-thread-access, chat-retention, review-fixes, reviews,
deal-conversation, offer-events, seller-price, inbox-order, thread-reads,
thread-timeline, deal-chat-e2e, deal-events, support-chat, admin-disputes,
deal-notify, offer-links, deal-feed.

New: `pair-chat-migration.test.ts` (rolled-back transaction: drop the pair
index, make listingId nullable, seed one pair with two listing threads — one
flagged, one closed, two readers, orders — a reversed pair and a single
thread; run the merge; assert every merged field; a second run changes
nothing); `pair-chat.test.ts` (second listing reuses the thread with an
opener; offer/deal on listing 2 lands in it with its listingId; reversed
pair separate; `proposePrice` refuses a listing never asked about); agent
scoping (deals on L1/agent X and L2/agent Y — X cannot see L2's messages,
files, preview, unread or notifications); `thread-focus.test.ts`; a panel
test with two concurrent deals; alias redirect (participant redirected,
stranger notFound); retention (deal on L1: L2 question purged, L1 kept);
fingerprint.

## 7. Rollout

Commits: (1) schema + three migrations + harness + migration test;
(2) server core + updated tests — deploy with (1); (3) UI; (4) `threadHref`
links; (5) later: drop `Conversation.listingId`.

VPS: count pairs that will merge
(`SELECT count(*) FROM (SELECT 1 FROM "Conversation" GROUP BY "buyerId",
"sellerId" HAVING count(*)>1) t;`); back up
(`pg_dump -Fc --no-owner -d "<url>" -f ~/backups/ca-$(date +%F-%H%M)-pre-pair-chat.dump`);
dry run into a scratch database and check message count unchanged,
conversation count = distinct pairs, every order's buyer/seller match its
conversation; stop the app, `pnpm db:migrate`, start the new build (~2 min);
rollback = `pg_restore --clean` from the dump.

## Risks

Data loss in the merge (backup, dry run, atomic DO block, alias table);
agents seeing too much (one helper + tests); a message tagged with the wrong
listing (focus defaults to the running deal, chip always visible); closures
now cover the pair (NOTICE count for staff); P2002 race on the new key
(catch and read back).
