# Client feedback (2026-10-19) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship the seven changes the client asked for after using the live site.

**Architecture:** Each change is a small vertical slice: a pure rule in `src/lib` pinned by unit tests, the server function that applies it pinned by Postgres tests, then the UI. The deal core (`src/server/deals.ts`) changes only where a role or a new field has to be read.

**Tech stack:** Next.js 16, React 19, Prisma 7 / Postgres, Better Auth, Vitest 5, Biome.

**Spec:** the client's message, quoted in the conversation of 2026-10-19, and the owner's answers. There is no separate design doc. The rulings below are the spec's gaps, decided.

## Global constraints

- No new dependencies.
- A buyer's handover account, agent emails and payment details never appear in message previews, notification bodies or event bodies. They appear on the deal panel or deal page to the people who need them, and in emails to those people.
- Every role check reads the database, as `roleOnDeal` does, never the session.
- Existing tests keep passing. A test that changes meaning gets a comment saying why.

## Owner's answers (binding)

1. Deal levels are strict bands with no overlap: level 1 takes deals under $100, level 2 takes $100 up to $999.99, level 3 takes $1,000 and up. (The owner lowered the bands on 2026-10-26; the enum names below keep the first amounts.)
2. Moderators act as agents. There is no separation of duties between desks.
3. Sellers may see a buyer's track record.
4. These changes go before the site polish.

## Rulings

- **Who can be a deal's agent:** AGENT, MODERATOR and SUPERADMIN ("custodian roles"). FINANCE stays out, because it moves money.
- **The level is read from the agreed price** (`Order.priceUsd`), not the total with fees.
- **No level set means no size limit.** That covers existing agents and the superadmin, so nothing in flight breaks. The team page shows "Any size" so the owner can set levels. Cost if wrong: a moderator without a level can take a large deal until one is set.
- **A moderator who is a deal's agent keeps their staff powers** on that deal (deciding a dispute, cancelling), because the owner has no one else. The second-approval rule above the threshold is unchanged: it is a fraud control, not a desk split.
- **Handover account field:** `Order.handoverTo` (a string). What it holds depends on the platform: a Google account email for YouTube, an email for Instagram and websites, an email or profile link for Facebook, an @username for Telegram. It is required when a buyer starts a deal. It is optional in the repository, so old deals and tests stay valid.
- **The buyer may correct it until the step that uses it is done.** That is the `handsOver` step: Fastest step 4, Safest step 7. A correction emails whoever acts on it next.
- **Who sees it:** the buyer, the seller on Fastest, the agent on both modes, and staff. On Safest the seller never needs it and does not see it.
- **The access email is copied at assignment.** Changing your own access email affects new assignments only. An open deal keeps the address its seller was given, since they may already have sent the invite.
- **Timers:** the payment window, Google's 7-day owner wait (YouTube only, after Safest steps 3 and 7), the Fastest recovery hold, offer expiry and an accepted offer's hold. Shown as a live countdown in the chat's deal card.
- **Track record:** completed deals only, as buyer and as seller together. Shows the count, total worth, and the Safest and Fastest split.

## Tasks

### Task 1: Agent and staff messages stand out in chat
**Files:** `src/components/messages/thread-view.tsx`
- Agent bubbles: gold-soft surface, gold hairline, a "Channel Adda agent" badge in the header line. Staff notices: the same tint.
- UI only. Verify with a screenshot of a thread with an agent.

### Task 2: The chat header links to the real channel
**Files:** create `src/lib/channel-link.ts` (+ test); modify `src/components/messages/chat-parts.tsx` (`ThreadHeader`), `src/app/(dashboard)/dashboard/messages/[id]/page.tsx`, `src/server/messages.ts` (thread select gains `listing.sourceUrl`, `listing.platform`), and the staff thread page if it renders `ThreadHeader`.
- `channelLink(platform, sourceUrl): { href: string; label: string } | null`: https only, and the host must belong to the platform (youtube.com/youtu.be, instagram.com, facebook.com/fb.com, t.me/telegram.me, any host for WEBSITE). The label reads "Open on YouTube" and so on.
- Tests: accepts the real forms; rejects `javascript:`, `http:` and foreign hosts; null when there is no URL.

### Task 3: Live countdowns in the chat's deal card
**Files:** create `src/lib/deal-waits.ts` (+ test), `src/components/messages/countdown.tsx`; modify `src/server/deal-panel.ts`, `src/lib/deal-panel.ts` (`PanelDeal` gains `wait`), `src/components/messages/deal-panel.tsx`; `src/data/platforms.tsx` gains `ownerWaitDays` (YouTube 7, others 0).
- `activeWait(input): { label: string; until: Date } | null`. The input holds mode, status, createdAt, holdUntil, completed steps with their `completedAt`, `paymentWindowHours`, `ownerWaitDays` and now. Precedence: payment window (AWAITING_PAYMENT) → recovery hold running → owner wait after Safest step 3 (until step 4) → owner wait after Safest step 7 (until step 8) → null. A wait already past returns null.
- `formatCountdown(ms)`: "4d 6h", "5h 12m", "12m 05s", "under a minute".
- `Countdown` ticks every second under an hour and every 30s above, with `aria-live="off"` and a `title` holding the exact date.

### Task 4: Track record on profiles and in chat
**Files:** create `src/server/track-record.ts` (+ test); modify `src/app/(site)/seller/[slug]/page.tsx`, `src/components/listing/listing-sections.tsx` (about the seller), `src/components/messages/chat-parts.tsx` (`ThreadHeader` shows the other party's record), the thread page.
- `trackRecord(userId): { deals: number; worthCents: number; safest: { deals; worthCents }; fastest: { deals; worthCents }; asBuyer: number; asSeller: number }`. Counts COMPLETED orders where the user is buyer or seller.
- Tests: counts both sides, splits by mode, ignores open and failed deals, zero for nobody.

### Task 5: The buyer names their handover account; the seller is emailed it
**Files:** migration `add_order_handover_to`; create `src/lib/handover-target.ts` (+ test); modify `src/server/deals.ts` (`createDeal` input, new `updateHandoverTo`, `getDealFor` view), `src/server/actions/deals.ts` (`startDeal(listingId, mode, accepted, handoverTo)`, `changeHandoverTo`), `src/components/listing/start-deal.tsx`, `src/server/deal-notify.ts` (`turnEmail` gains `handoverTo`), the deal page and the chat deal panel.
- `handoverTarget(platform)` returns `{ label, placeholder, hint }`. `parseHandoverTo(platform, raw)` returns `{ ok: true, value } | { ok: false, error }`: an email for YOUTUBE, INSTAGRAM and WEBSITE; an email or facebook.com link for FACEBOOK; `@username` (5–32 characters, `[A-Za-z0-9_]`) for TELEGRAM, normalised to a leading @.
- `startDeal` refuses a missing or invalid value before creating anything.
- `turnEmail` adds "Give owner access to: X" when `handoverTo` is passed. `notifyNextActor` passes it when the recipient is the seller on Fastest or the agent on either mode.
- `updateHandoverTo({ orderId, byUserId, value })`: buyer only; refused once the `handsOver` step is complete or the deal is terminal; audited; notifies the person who acts on it next.
- Tests: the parser per platform; `startDeal` refusing without it; it being stored; the seller's Fastest turn email after payment containing it; a correction allowed before handover and refused after; the Safest seller's email not containing it.

### Task 6: Moderators act as agents, with levels
**Files:** migration `add_user_deal_level`; create `src/lib/custody-roles.ts` (+ test); modify `src/server/deals.ts` (`roleOnDeal`, `assignAgent`, `resolveDeal`), `src/server/thread-access.ts`, `src/server/messages.ts` (`roleInThread` checks the agent before staff; `listThreads`), `src/server/upload-access.ts`, `src/server/deal-feed.ts`, `src/server/session.ts` (`requireAgent`), `src/server/actions/deals.ts` (`claimDeal`), `src/server/admin-users.ts` (`setUserRole` keeps the identity for custodian roles, `setAgentIdentity`, `listAssignableAgents` with level, new `setDealLevel`), `src/server/actions/admin-users.ts`, `src/app/(admin)/admin/deals/page.tsx`, `src/components/admin/deal-controls.tsx`, `src/app/(admin)/admin/team/page.tsx`, `src/components/admin/user-controls.tsx`, `src/app/(admin)/admin/users/[id]/page.tsx`, `src/app/(admin)/layout.tsx`, `src/components/app/user-menu.tsx`.
- `prisma`: `enum DealLevel { UNDER_10K UNDER_100K FROM_100K }`, `User.dealLevel DealLevel?`.
- `isCustodianRole(role)`, `levelFor(priceCents): DealLevel`, `withinLevel(level | null, priceCents): boolean`. The bands are strict, with boundaries at 10,000 and 100,000 cents.
- `assignAgent`: the assignee must hold a custodian role and be within level, otherwise the new failure `"out-of-level"` with the message "This deal is outside {name}'s level."
- `roleOnDeal`: "agent" when they are the deal's agent and hold a custodian role. `resolveDeal`: when the actor is "agent" and the user is staff, a transition legal for staff is allowed too.
- Tests: the bands at their exact boundaries; a moderator assigned and able to complete agent steps; a moderator refused outside their level; claiming refused outside level; a superadmin assigned; the moderator-agent seeing the thread as "agent"; `setUserRole` to MODERATOR keeping the identity; an AGENT with no level still taking any deal.

### Task 7: Agents and moderators set their own access email
**Files:** modify `src/server/actions/admin-users.ts` (new `setMyAgentIdentity`), the account security page `src/app/(dashboard)/dashboard/security/page.tsx` (a "Deal desk" card for custodian roles), plus a small client form.
- `setMyAgentIdentity(email, brand)`: requires a custodian role, sets the caller's own identity through `repo.setAgentIdentity`, and audits it as self-service.
- Tests: an agent changes their own; a USER is refused; the next assignment copies the new address; an open deal keeps the old one.

### Task 8: Verify and review
Full suite, typecheck, lint, production build against `channeladda_e2e`, screenshots of the chat (agent message, countdown, channel link, track record) and the start-deal form, then a fresh reviewer and one fix pass.
