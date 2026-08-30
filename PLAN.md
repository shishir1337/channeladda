# Channel Adda — build plan

Phase order: **public frontend → dashboards → backend.**
Each phase ships complete before the next starts.

---

## Phase 1 — Public frontend ✅ COMPLETE

Everything a visitor can reach without a role dashboard. Built against a typed
mock data layer in `src/data/` shaped like the eventual API response, so Phase 3
swaps the source and not the components.

### 1A. Marketplace core — the reason the site exists

| Route | Page | Notes |
| --- | --- | --- |
| `/` | Home | ✅ done |
| `/browse` | Browse & search | ✅ done — URL filters, facets, sort, pagination |
| `/browse/[platform]` | Platform landing | ✅ done — 5 routes, per-platform transfer copy |
| `/listing/[id]` | Listing detail | ✅ done — 48 pages, fee breakdown, transfer checklist |
| `/sold` | Recently sold | ✅ done — 24 settled deals, grouped by recency |
| `/sellers` | Verified sellers | ✅ done — 14 sellers |
| `/seller/[slug]` | Seller profile | ✅ done — 14 pages |

### 1B. Sell side & services

| Route | Page | Notes |
| --- | --- | --- |
| `/sell` | Sell landing | ✅ done |
| `/services` | Services index | ✅ done |
| `/services/[slug]` | Service detail | ✅ done — 6 pages |

### 1C. Trust & information

| Route | Page | Notes |
| --- | --- | --- |
| `/how-it-works` | How it works | Escrow flow, Quick vs Escrow, per-platform transfer |
| `/trust-safety` | Trust & safety | KYC, ownership check, disputes, moderation |
| `/fees` | Pricing & fees | Buyer fee, seller fee, payout costs, worked example |
| `/about` | About | |
| `/support` | Contact support | Contact form + response-time promise |
| `/help` | Help centre | Categorised articles |
| `/help/[slug]` | Help article | |
| `/affiliates` | Affiliates | |

### 1D. Auth screens

| Route | Page |
| --- | --- |
| `/signin` | Sign in |
| `/signup` | Create account |
| `/forgot-password` | Request reset link |
| `/reset-password` | Set new password |
| `/verify-email` | Email verification landing |

✅ done — 5 screens, real client-side validation. Wired to Better Auth in 2B.

### 1E. Legal

`/terms` · `/privacy` · `/refunds` · `/aml-kyc` · `/listing-rules`

✅ done — 5 policy documents sharing one renderer.

### 1F. System states

✅ done — root + group `not-found`, `error`, `global-error`, browse skeleton, empty states.

**Phase 1 delivered: 109 generated pages across 30 route patterns.**

Verified: 114 internal URLs crawled with zero broken links, every page exactly
one `h1`, 138 page/viewport/theme combinations with no horizontal overflow, no
unnamed controls, no broken images and no console errors — on the production
build.

### Deferred out of Phase 1

`/blog` and `/careers` — footer links stay, pointing at a "coming soon" block
rather than a 404.

---

## Phase 2 — Database first, then dashboards

**Reordered deliberately.** The dashboards are almost entirely *mutations* —
creating a listing, sending an offer, accepting it, releasing escrow. Mock data
cannot represent those honestly, so building the dashboards first would mean
building a fake data layer and then throwing it away. The schema comes first and
the dashboards are built on real queries.

### 2A. Database ✅ COMPLETE — verified end to end

Postgres 16 in Docker (`pnpm db:up`, host port 5433) with a Prisma 7 schema of
17 models covering both state machines, users and roles, KYC, offers, messages,
transfer steps, disputes, reviews, the ledger, withdrawals, notifications,
reports and an immutable audit log.

Seeded from the Phase 1 fixtures plus two years of trading history:
20 users (3 staff, 14 sellers, 3 buyers), 1,572 listings (48 live),
1,524 completed orders, 6,096 ledger entries, ~$39M settled.

The history matters: every headline figure on the site is now *derived* from
those orders. Before it existed the hero claimed "31,400+ transfers" directly
above a tile showing the real count, which is exactly the kind of thing a
client spots first.

**The whole public site now runs on Postgres.** `src/server/` is the only place
that touches Prisma; pages call it and get back the same application types the
components already consumed, so no component changed shape.

Decisions made while building it:

- **Money is integer cents** in the database, converted to dollars at the
  repository boundary. No floats anywhere near a price.
- **The in-memory query engine was deleted**, not kept alongside the SQL one.
  `src/lib/listing-query.ts` now holds only filter shapes and the URL codec;
  `src/server/listings.ts` holds the single implementation of the rules.
- **Seller stats are derived, not stored.** Rating, sales and settled volume
  come from real reviews and completed orders, so they cannot drift from what
  happened.
- **Listings are addressed by slug** (`/listing/kidstoylandtv-youtube`), not by
  cuid. Search is the main acquisition channel; opaque ids waste it.
- **Artwork URLs are stored on the row** rather than derived from an id,
  because in production these are files a seller uploads.
- ISR at 60s on the home, sold and seller pages; `/browse` and `/listing` are
  fully dynamic. Prisma queries are invisible to Next's cache detection, so
  this is declared explicitly on each route.
- **Card badges split by nature.** `featured` is a stored editorial decision;
  *new*, *price drop* and *hot* are derived from the row at read time, so they
  stay true without anyone maintaining them.
- **A dead database is a designed state, not a stack trace.** Next sanitises
  Server Component errors before `error.tsx` sees them, so the check runs
  server-side in `databaseGate()` — applied only to the seven pages that read
  data, leaving fees, policies and auth working regardless.

**Verified:** 258 end-to-end assertions across 14 suites and 28 repository
tests, all green against the production build on live Postgres. 114 URLs
crawled with no broken links, 138 page/viewport/theme combinations clean.

### 2B. Accounts and sessions ✅ COMPLETE — verified end to end

**Better Auth 1.7.1** with the Prisma adapter. Passwords live on `Account`,
never on `User`; sessions and one-time tokens are real rows.

- Sign up, sign in, sign out, password reset, email confirmation
- `src/server/session.ts` — `getCurrentUser`, `requireUser`, `requireStaff`,
  `requireRole`. A wrong role gets a 404 rather than a "forbidden" page, so an
  admin route never confirms its own existence to someone who cannot use it.
- Privileged fields (`role`, `kycStatus`, `slug`, `bannedAt`) are declared
  `input: false`, so the sign-up endpoint cannot be used to create a superadmin.
  There is a test for exactly that.
- Rate limiting on by default. Better Auth's own burst rules cover sign-in and
  sign-up; only the session-read endpoint is raised, since the header reads it
  on every page load.
- `/dashboard` is a placeholder landing page. The real dashboards are next.

**Still missing here:** per-account lockout after repeated failures, two-factor,
and a real email provider — `src/server/mailer.ts` prints to the server log in
development and refuses to run in production rather than silently dropping mail.

### 2C. File uploads ✅ COMPLETE — local disk for now

Local storage behind `src/server/storage.ts`, so the move to ImageKit is a
one-file change. Files land in `.data/uploads/` and are served by a route
handler rather than from `public/`, which leaves room for the permission check
that proof and KYC documents will need.

Type is decided by reading the file's own bytes. SVG is refused. 19 tests cover
the cases that matter: a script renamed `.png`, an SVG, path traversal, an
oversized file, and an unauthenticated upload.

**Deferred by decision:** ImageKit and a real email provider. Local uploads
stand in until then.

### 2D. Seller listings ✅ COMPLETE — verified end to end

A seller can now create, edit and submit a listing without anyone touching the
database by hand.

- `/dashboard/listings` — everything they have, with a status that says whose
  turn it is rather than what the enum is called
- `/dashboard/listings/new` and `/dashboard/listings/[id]` — one form, saved as
  a draft at any point
- Cover, avatar and up to eight proof screenshots, each stored by content hash
  so the same screenshot under two sellers is detectable later
- Ownership code issued on submit, then a moderator-facing review state

**The rules that hold:** every repository function takes a `sellerId` and
filters on it — there is no "get by id" that skips the owner check. Status
transitions are refused out of order, so a live listing cannot have its price
rewritten by replaying an old form submission. Validation runs on the server
regardless of what the browser did. Money never becomes a float.

**Still admin's job:** nothing here approves a listing. `ADMIN_REVIEW` is where
the seller's part ends.

### 2E. Moderation ✅ COMPLETE — the loop closes

A listing can now go from a seller's draft to the public site without anyone
touching the database.

- `/admin` — the queues, and a record of what staff have done
- `/admin/listings` — the review queue, **oldest first**, so nobody sits at the
  bottom forever
- `/admin/listings/[id]` — the ownership code to check, the numbers claimed,
  the proof, the seller's track record, and approve / send back / take down

**Duplicate screenshots are flagged.** The same file byte-for-byte under two
sellers means at least one does not own what they are selling. This is what the
content hash on every upload was for.

**Rejection needs a reason.** The seller reads it word for word, so a bare "no"
is not on offer — the button stays disabled until there is something to act on.

**Every decision writes an audit row** naming the actor. Audit rows are never
updated or deleted; there is deliberately no helper that would.

**Access control is not a UI concern.** The admin layout guards the group, but
every action re-checks the role itself. A wrong role gets a 404, not a
"forbidden" page — that an admin route exists is not information an attacker
needs.

### 2F. Fees are configurable ✅ COMPLETE

The 3% / 5% split is no longer in the code. A superadmin sets it at
`/admin/settings` — not a moderator, not finance, because changing what every
future sale costs is a different kind of decision from approving one listing.

- Rates are stored as **basis points** (300 = 3.00%), so a rate is always an
  integer and never arrives as 0.030000000000000002
- The form shows worked examples at the rates being typed, before saving
- Bounded: negative refused, over 30% refused, zero allowed — free is a real
  business decision
- Every change writes an audit row with the before and after values
- `/fees` and `/sell` are revalidated on save, and the `/fees` page
  **description** is generated too, so search results cannot quote a stale rate

**Changing a rate never rewrites history.** An Order stores the fee it was
charged in cents, not the rate, so a change moves the next sale and not the
last one. There is a test that proves it against a real completed order.

**One bug fixed on the way:** the old `buyerTotal` rounded the fee to whole
dollars, so a $99 sale was quoted a $3 fee rather than $2.97. Harmless while
this was display-only; not harmless once it reaches a charge. The arithmetic
now runs in integer cents throughout.

**Still unconfirmed by the business:** 3% and 5% remain the *defaults*. They are
now changeable without a deploy, which is the point — but nobody has confirmed
they are the right numbers.

### 2G. Offers ✅ COMPLETE

Buyers negotiate, sellers answer, and an accepted offer takes the listing off
the market.

- Offer from the listing page; open offers on both sides at `/dashboard/offers`
- Accept, counter, decline; the buyer can withdraw while it is the seller's move
- Counters alternate, and each card says whose move it is
- Offers lapse after a window the admin sets (default 48 hours)

**The rule this exists to protect: two buyers must never both be told they can
buy the same listing.** Accepting is a *conditional* write — the listing only
changes to RESERVED while it is still LIVE. Two accepts fired at the same
instant give exactly one winner; the other is told the listing is taken. There
is a test that fires both simultaneously.

Accepting also answers every other open offer on that listing, so nobody is
left waiting on a decision that has already been made.

**Expiry needs no scheduler.** An OPEN offer past its expiry reads as expired
and cannot be accepted. There is no cron in this system, and an offer that
stays acceptable because nothing swept it is a way to lose money.

**Not built yet:** notifications. Both sides have to visit the page to see a
new offer. `Notification` exists in the schema and is unused.

### 2H. The dashboard shell ✅ COMPLETE

The signed-in area used to borrow the *marketing* chrome — announcement bar,
marketing nav, footer, mobile action bar — so every dashboard page read as a
website page with a table on it. It is a tool now.

- Collapsible sidebar with grouped navigation, an icon rail, and a mobile
  drawer; the collapse choice is remembered
- Sticky app header that names where you are, derived from the nav rather than
  passed down by every page, so it cannot drift
- A shared page vocabulary in `page-parts.tsx`: `PageHead`, `Section`,
  `Stat`, `Rows`, `Empty`, `TurnFlag`
- One shell, two navigations — staff get the same interface with a staff mark
  in the rail, so nobody is unsure which side of the product they are on

**The idea it is built around: whose turn is it.** The offers data already
carried an `awaiting` field, and that is now structural. Live counts sit in the
sidebar, and the overview opens with the things that will not move until you
act — not with lifetime volume. Badges only ever count what is waiting on *you*:
a badge that is always lit stops meaning anything.

**Listings are grouped by stage.** A seller with 109 completed sales was
scrolling past all of them to reach the five that are live. Sold listings are an
archive now, capped and last.

### 2I. Remaining dashboards

**Buyer** — purchases, active orders, favourites, messages, offers, payment
status, access instructions, disputes, reviews, settings, KYC, balance.

**Seller** — listings (create / edit / pause / mark sold), proof uploads, orders,
messages, offers, earnings, withdrawals, sales history, reviews, KYC.

**Admin** — listing review queue, KYC queue, disputes, withdrawals, reports,
users, finance, analytics, audit log, role separation.

Checkout (`/checkout/[orderId]`) belongs here, not Phase 1 — it needs an account
and an order to exist.

---

## Phase 3 — Behaviour on top of the schema

The tables exist; the actions that move rows between states do not yet.

- Auth sessions and password verification (hashes are already seeded)
- Listing creation, ownership-code check, admin approval
- Offers: send, counter, accept — and the reservation clock
- Cryptomus checkout, escrow transitions, cooling-off release
- Withdrawals with address-change locking
- Disputes, refunds, partial settlements
- Notifications and the audit log write path

---

## Rules for Phase 1

1. **Shared before pages.** The filter engine, listing-card variants, auth shell
   and page shell get built once. `/browse`, `/browse/[platform]` and
   `/seller/[username]` are then mostly configuration.
2. **Filters live in the URL.** `?platform=youtube&min=1000&monetized=true`.
   Shareable, back-button-correct, and the shape the API will take later.
3. **Data contracts are fixed now.** Types in `src/data/` are the contract Phase 3
   implements against.
4. **No dead links.** Every footer and nav link resolves to a real page by the end
   of the phase.
5. **Every page ships responsive, both themes, keyboard-navigable** — same bar as
   the homepage.
