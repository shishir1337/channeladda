# SDD ledger — plan: docs/superpowers/plans/2026-10-19-deal-chat.md

Spec: docs/superpowers/specs/2026-10-18-deal-chat-design.md
Worktree: ../dealbaron-chat on feat/deal-chat (sibling, per memory: tsconfig includes **/*.ts)
Setup: Ruling: git worktree add at a sibling path instead of the native worktree tool — the native tool nests inside the repo, which breaks typecheck of the main tree — cost if wrong: none, the harness just cannot see this worktree
Baseline: pnpm test → 40 files, 392/392 pass (de0be94)

Pre-flight (shared interfaces):
- T2 ensureConversation/postEvent → T3, T4, T7: same signatures. Clean.
- T3 offerTurn → T5, T6, T9: clean. T3 createOffer/makeOffer conversationId → T10: clean.
- T1 SenderRole → T6: clean. T6 ChatOfferCard `actions` → T9: clean.
- T8 PanelInput.heldOffer.heldUntil ← T9 heldByAcceptedOffer gains respondedAt: T9 owns both. Clean.
- T7 withdrawOffer (either side) → T9 OfferActions Withdraw: T7 precedes T9. Clean.
- T9 DealPanel → T11 deal states → T12 PayToCard in the step state: clean.
- T5 threadFingerprint access → T14 agent rule: T14 widens it. Clean.
- T1 createDeal link from existing thread → T4 replaces with ensureConversation: intended. Clean.
Task 1: Ruling: brief names `getDispute`; the function is `listDisputes({ role })` — used it — cost if wrong: none, a name in a test
Task 1: Ruling: Message.sender stays onDelete Restrict, not Prisma's SetNull default for an optional relation — SetNull would turn a deleted user's messages into ones that read as Channel Adda's — cost if wrong: deleting a user with messages stays blocked, as it was
Task 1: note: "messages survive the ten-day purge" passed before the change — it pins existing behaviour across the link move, not new behaviour
Task 1: complete (commits de0be94..a82dc07, tests: pnpm test src/server/deal-conversation.test.ts src/server/chat-retention.test.ts src/server/review-fixes.test.ts →    Duration  21.99s (tests 95%, import 5%, transform 1%))
Task 2: complete (commits a82dc07..8e714bf, tests: pnpm test src/lib/chat-events.test.ts src/server/chat-events.test.ts →    Duration  1.67s (tests 75%, import 16%, transform 8%, worker 1%))
Task 3: Ruling: accept, decline, counter and withdraw now claim the offer with a compare-and-set on OPEN inside their transaction (was a read before the transaction, then an unconditional update) — chat buttons make double presses likely, and a double-pressed counter left two open offers on one listing; added test "two counters pressed at once make one" — cost if wrong: none found; a lost race now returns "wrong-turn" ("already answered") instead of succeeding twice
Task 3: Ruling: added `notifyClosedOffers` (exported) so Task 4's createDeal auto-decline reuses the same notification — cost if wrong: one helper
Task 3: Ruling: the seller's "back on sale" notification after a lapsed acceptance still links to /dashboard/listings (it is about the listing, kind LISTING); the buyer's links to the thread — cost if wrong: one href
Task 3: complete (commits 8e714bf..cefa064, tests: pnpm test src/server/offer-events.test.ts src/server/offers.test.ts src/server/offer-to-deal.test.ts src/server/logic-fixes.test.ts →    Duration  11.99s (tests 88%, import 10%, transform 1%))
Task 4: Ruling: createDeal marks the opening buyer's own open offer WITHDRAWN, not REJECTED — they superseded it by buying; "Declined" on its card would be false — cost if wrong: one status on a dead offer
Task 4: Ruling: a staff decision (resolveDeal by staff) writes its line with no sender — staff speak as Channel Adda, never by name; with a sender it would have shown the moderator's name as an "agent" — cost if wrong: none
Task 4: Ruling: lines written by one step are 1 ms apart (step, hold, outcome) — the thread sorts by time and equal times have no order — cost if wrong: none
Task 4: Ruling: finishing through the last step also writes a "Deal completed" line (spec: "deal ended (each outcome)"); test "finishing through the last step writes the outcome" added — cost if wrong: one line
Task 4: Ruling: the agent line is skipped when the same agent is re-assigned — nothing changed for the seller — cost if wrong: none
Task 4: note: the two race tests passed before implementation (guards). Verified they bite: with a conversation write inside payFromWallet's transaction, "a message arriving during a balance payment does not refuse it" FAILS ({ ok: false, reason: 'insufficient' }); reverted.
Task 4: note: updated two older tests whose premise this change replaces — chat-retention counts TEXT messages (a deal now writes lines into its thread); admin-disputes: every deal has a conversation now, so the processor-frozen deal's desk shows it
Task 4: complete (commits cefa064..37a7284, tests: pnpm test src/server/deal-events.test.ts src/server/deal-flow.test.ts src/server/deals.test.ts src/server/deal-guards.test.ts src/server/wallet.test.ts src/server/deal-agent.test.ts →    Duration  38.71s (tests 94%, import 6%))
Task 5: Ruling: roleOf in messages.ts is exported as roleInThread (renamed, not wrapped) so the page and the poll share one access rule — Task 14 widens it — cost if wrong: a rename
Task 5: Ruling: the page takes the fingerprint BEFORE reading the thread — taken after, a change between the two reads would be in the fingerprint but not on the page, and no refresh would ever come — cost if wrong: none
Task 5: note: LiveRefresh (client) has no unit test — no DOM environment in this suite; verified in the final browser walkthrough
Task 5: complete (commits 37a7284..0c8cb0f, tests: pnpm test src/server/thread-fingerprint.test.ts src/server/messages.test.ts →    Duration  4.42s (tests 86%, import 11%, transform 2%))
Task 6: Ruling: added src/lib/chat-time.ts (chatTime, timeLeft) and src/components/messages/serialize.ts (toMessageViews) — shared by messages, cards and lines, and by both thread pages — cost if wrong: two small modules
Task 6: note: "every thread reader copes with a system event" passed before implementation — Tasks 1 and 4 had already handled a null sender, and Prisma's `not` excludes NULL so system lines are never unread. Kept as the Review Focus 1 guard.
Part 1 check: pnpm test 47 files / 456 pass; typecheck, lint clean; pnpm build clean WITH DATABASE_URL=test DB.
Part 1: Ruling: production builds run with DATABASE_URL pointed at the test database — the build prerenders / and /sold against the database, the dev DB is not migrated (and must not be, by the plan), so it fails with ColumnNotFound — cost if wrong: none; the owner's switch-over steps migrate the dev DB
Task 6: complete (commits 0c8cb0f..c9e3429, tests: pnpm test src/server/thread-timeline.test.ts src/server/messages.test.ts →    Duration  4.32s (tests 79%, import 17%, transform 3%))
Task 7: Ruling: proposePrice's "already-open" reads "There is an offer open in this conversation already. Answer that one first." (the shared wording tells a buyer to withdraw) — cost if wrong: one sentence
Task 7: complete (commits c9e3429..bd27cca, tests: pnpm test src/server/seller-price.test.ts src/server/offer-events.test.ts src/server/logic-fixes.test.ts →    Duration  10.61s (tests 90%, import 9%, transform 1%))
Task 8: note: three extra rows beyond the brief — "agent: no deal at all, never an offer button", "staff: no deal", "hold over: the agent's move again" — they pin the other side of rules the brief names
Task 8: complete (commits bd27cca..d1bc313, tests: pnpm test src/lib/deal-panel.test.ts →    Duration  204ms (import 44%, transform 28%, tests 16%, worker 11%))
Task 9: Ruling: test "a stranger gets nothing" became "an unknown conversation gives nothing" — loadPanelInput is given the viewer's role, so access is decided before it is called (by getThread, as for everything on the page) — cost if wrong: none; the page already 404s a stranger
Task 9: Ruling: heldByAcceptedOffer returns `heldUntil` (respondedAt + window) instead of `respondedAt` — the one value every caller wants — cost if wrong: none
Task 9: Ruling: the offer form is OfferComposerForm({ config, onDone }) rendered above the message box by ThreadView, with ThreadView owning the toolbar button — the button and the form live in different places in the composer — cost if wrong: a rename
Task 9: Ruling: offer buttons appear on the open card AND in the panel (spec §2 "same as its card") — the reader acts wherever they are reading — cost if wrong: one duplicated set of buttons on screen
Task 9: Ruling: the panel remounts (key) when its state changes, so on a phone it reopens when it becomes the reader's move — cost if wrong: none
Task 9: note: deal states in the panel are placeholders (a line and a deal-page link) until Task 11
Task 9: complete (commits d1bc313..8004e9f, tests: pnpm test src/server/deal-panel.test.ts src/lib/deal-panel.test.ts src/server/offer-to-deal.test.ts →              at least ~320ms faster with isolate: false — reuses workers across files instead of one per file)
Task 10: note: added a second test, "a seller's own price is not a counter", pinning counterOf null on a proposed price (the label depends on it)
Task 10: complete (commits 8004e9f..9ce1f54, tests: pnpm test src/server/offer-links.test.ts →    Duration  1.68s (tests 67%, import 26%, transform 6%))
Task 11: Ruling: DealView gains conversationId (startPayment reads it through getDealFor, and the deal page links to the chat) — cost if wrong: none
Task 11: Ruling: for pay and step the deal page's own card IS the panel (no frame around it), keeping only the phone's one-line toggle — a card inside a card repeated the heading — cost if wrong: layout only
Task 11: Ruling: StartDeal in the panel gets the three fee rates, not the whole settings object — the rest of the settings has no business in the browser — cost if wrong: none
Task 11 check: pnpm test 52 files / 501 pass; typecheck, lint clean; build clean (test DB)
Task 11: complete (commits 9ce1f54..26e6a29, tests: pnpm test src/server/pay-return.test.ts src/server/pay-attempts.test.ts →    Duration  3.21s (tests 71%, import 24%, transform 4%))
Task 12: Ruling: BUYER_PAYS_AFTER_STEP (5) lives in src/lib/pay-to.ts, not the server module — deals.ts and the server both need it, and a constant does not need the database — cost if wrong: none
Task 12: Ruling: DealView also gains `buyerPayStepReached` — the buyer's card has to tell "not your turn yet" (show nothing) from "your turn, and the seller has said nothing" (say so) — cost if wrong: one field
Task 12: Ruling: a change the buyer could already see notifies them by EMAIL as well as in the bell; the reminder to a seller with no details does too — both are the kind of thing that stalls or costs money if ignored (notifications rule 2) — cost if wrong: two emails
Task 12: Ruling: a seller sees the editor in the panel from the moment the deal opens (the waiting-for-payment state), as the spec asks — cost if wrong: none
Task 12: Ruling: saving identical text is a no-op (no line, no audit) — cost if wrong: none
Task 12: Ruling: deal actions' refresh() also revalidates the conversations (layout) — deal steps write into them — cost if wrong: none
Task 12: complete (commits 26e6a29..33a828a, tests: pnpm test src/lib/pay-to.test.ts src/server/pay-to.test.ts src/server/deal-flow.test.ts →    Duration  12.98s (tests 92%, import 6%, transform 1%))
Task 13: complete (commits 33a828a..de2fdc5, tests: pnpm test src/server/deal-notify.test.ts src/server/wallet.test.ts src/server/deal-flow.test.ts →    Duration  16.93s (tests 93%, import 6%, transform 1%))
Task 14: Ruling: agentOnThread / stillAnAgent / runningDealsOf live in src/server/thread-access.ts, not messages.ts — upload-access needs them and messages.ts already imports upload-access; one shared module avoids the cycle — cost if wrong: one file
Task 14: Ruling: roleInThread became async (it may query for an agent) and takes the thread id — every caller already awaited inside an async function — cost if wrong: none
Task 14: Ruling: an agent's and staff's conversation title and inbox name read "<buyer> and <seller>" — they are talking to both — cost if wrong: one string
Task 14: note: "an agent of another deal sees nothing" passed before implementation (agents were locked out entirely); kept as the guard that the new access stays narrow
Task 14: complete (commits de2fdc5..4da758b, tests: pnpm test src/server/agent-thread-access.test.ts src/server/messages.test.ts src/server/chat-retention.test.ts →    Duration  9.26s (tests 88%, import 11%, transform 1%))
Task 15: Ruling: the migration backfills each side's marker from the old flags (newest message from the other side that was marked read), not a blanket now() — nothing already read turns unread, and nothing unread is silently marked read — cost if wrong: none
Task 15: Ruling: unread counts are one raw SQL query per inbox (a per-thread threshold cannot be said in Prisma's filters) — cost if wrong: one query to maintain
Task 15: Ruling: a staff note's MESSAGE notification title says "Channel Adda sent you a message", not the moderator's name — staff speak as Channel Adda everywhere; the old title leaked the name — cost if wrong: none
Task 15: note: "system events never make a thread unread" passed before (Prisma excludes NULL senders); kept as the guard under the new raw SQL, which says it explicitly
Task 15: complete (commits 4da758b..211399c, tests: pnpm test src/server/thread-reads.test.ts src/server/messages.test.ts src/server/thread-timeline.test.ts →    Duration  7.61s (tests 83%, import 15%, transform 2%))
Task 16: e2e: deal-chat-e2e.test.ts 2/2 passed on first run (no earlier task needed a fix)
Task 16: Ruling: found in the browser walkthrough — the seller's panel at "Invite the agent as owner" did not show the agent's address (only the deal page did); extracted AgentInvite (src/components/deals/agent-invite.tsx) and render it in the panel's step state and on the deal page, never for the buyer — cost if wrong: none. No unit test: a pure move of existing markup with its existing condition; verified in the browser
Task 16: Ruling: verification ran against `channeladda_e2e`, a new local database restored from a pg_dump of the dev DB and then migrated — the route sweep needs the seeded data, which lives in the dev DB, and the dev DB must not be migrated — cost if wrong: a scratch database the owner can drop
Task 16: Full verification: pnpm test 57 files / 539 pass; typecheck clean; lint clean; build clean (e2e DB); route sweep 131/131 (port 3121, BETTER_AUTH_URL=http://localhost:3121); browser walkthrough buyer → seller → buyer → agent → seller through ask/offer/counter/accept/start/pay-from-balance/agent claim+message/pay-to save/step 2, desktop and below-lg width; 390px not reachable (window would not resize)
Task 16: note: walkthrough test data — the agent identity was mistyped by me into a prefilled field (concatenated); corrected in the e2e copy; not a code fault
Task 16: complete (commits 211399c..edc02a2, tests: pnpm test src/server/deal-chat-e2e.test.ts →    Duration  2.38s (tests 78%, import 16%, transform 6%))
Final review: fresh reviewer (opus) — Critical 0, Important 3, Minor 12. Verdict "With fixes".
Final: Re-grade — Important 1-3 stand; Minor 4 (winner told they lost) re-graded Important: likely while the sweep cron is not running (CRON_SECRET unset), and a false loss message to the winner; Minor 5 (held lapse not in fingerprint) re-graded Important: the panel keeps claiming a price is held and Start would open at the asking price; Minor 9a (buyer waiting for details not told when they arrive) re-graded Important: stalls the money step; Minor 14 (agent email in buyer's page data) re-graded Important: the custody account's address exposed to any buyer via the page payload
Final: fixed staff-raised dispute names the moderator — "a dispute staff raise is Channel Adda's, not the moderator's" RED→GREEN, suite 547/547
Final: fixed agent's deal-ended notification points at a 404 — "finishing a deal through its last step tells all three" (updated: agent → deal page) RED→GREEN; and the deal page chat link for an ended agent — "an agent whose deal ended is not pointed at its conversation" RED→GREEN, suite 547/547
Final: fixed agent cannot write in a closed conversation from the UI — src/lib/thread-rules.ts writesInClosedThread, "Channel Adda's own people can still write in a closed conversation" RED→GREEN, used by sendMessage and the page, suite 547/547
Final: fixed winning buyer told they lost — "accepting never tells the winning buyer they lost" RED→GREEN, suite 547/547
Final: fixed fingerprint misses held-offer lapse — "a held acceptance lapsing changes it" RED→GREEN, suite 547/547
Final: fixed buyer not told when details arrive at their turn — "details added once the buyer is waiting for them tell the buyer" RED→GREEN, suite 547/547
Final: fixed agent email in the buyer's deal view — "the buyer's deal view never carries the agent's email" RED→GREEN; updated deal-flow "a deal view tells each side what is theirs to do", which pinned the leak; suite 547/547
Final: minor (deferred): postEvent sets lastMessageAt unconditionally, so a balance payment's after-commit line can move it backwards (inbox order slightly off)
Final: minor (deferred): the "finished" panel says "This deal has ended" without the outcome (the header badge and the last line show it); the staff panel omits whose move
Final: minor (deferred): in a closed conversation the buy/propose panel copy still points at the message box, which is hidden for the two sides (offers without a note still work from the listing page)
Final: minor (deferred): two concurrent first saves of payment details both read "added"; the changed-warning is skipped for the second
Final: minor (deferred): the dispute desk's "messages" count includes offer cards and event lines
Final: minor (deferred): the Offers page "Open the chat" link is read from the offer's card, which the 10-day purge deletes in threads that never had a deal
Final: minor (deferred): a buyer with an unverified email can counter a seller's price (makeOffer checks; counterOffer does not)
Final: minor (deferred): countUnreadThreads loads every conversation id and runs an agent check on each dashboard render; one SQL join would do
Final: minor (deferred): offer card amounts show cents ("$12,000.00") where the listing shows "$13,800"; time left shows "1d left" for 47h59m
Final: minor (deferred): on a long thread the page lands on the newest message, so the panel's action is one scroll up
Final: minor (deferred): the composer placeholder ("Ask about revenue…") is the buyer's wording for every reader, the agent included
Final: Ruling: reviewer's "declined to judge" — native ON CONFLICT for the upsert race: stands on the passing 5-round race test; bare domains (paypal.me/x) allowed in payment details: the spec's definition of a link, kept; phone/WhatsApp in payment details from step 6: the spec's deliberate exception; check-then-insert offer race: pre-existing, its harmful consequence is fixed above; markThreadRead stamping now: pre-existing shape, at most one message read early until the next poll; locale/timezone hydration: pre-existing pattern; no #offer anchor in notifications: cosmetic; "Price from the seller" on seller counters: wording; absolute time on the change warning: wording; pay-to card below the step card: layout; duplicated offer buttons: ledgered ruling; staff unread untracked: spec; backfill inheriting old staff-read state: preserves old state, site not live; own seller price marked WITHDRAWN by createDeal: ledgered ruling — cost if wrong for all: cosmetic or as already ledgered
Final: minor (deferred): an agent or staff writing in a closed conversation sees the message box but no note that the two sides cannot reply
