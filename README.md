# Channel Adda

An escrow-protected marketplace for buying and selling social media accounts —
YouTube channels, Instagram and Facebook pages, Telegram channels and content
websites. Payments are held until the buyer confirms the handover.

Next.js 16 · React 19 · Tailwind v4 · Prisma 7 · PostgreSQL · Better Auth

---

## Running it locally

```bash
pnpm install
pnpm db:reset     # migrate + seed: 20 users, 1,572 listings, 1,524 orders
pnpm dev          # http://localhost:3000
```

**`pnpm dev` and `pnpm build` start Postgres for you.** They run
`scripts/ensure-db.mjs` first, which checks the port, then tries Docker, then a
local PostgreSQL install — so a reboot does not leave you with a dead site.

`DATABASE_URL` points at port **5434** and both backends listen there, so
switching between them needs no config change:

```bash
pnpm db:up            # Docker
pnpm db:up:native     # a private local cluster in C:/tmp/dbpg
pnpm db:check         # start whichever is available, if neither is running
```

The local cluster is created with
`initdb -D C:/tmp/dbpg -U channeladda --auth=trust` and is entirely separate from
any Postgres service you already run.

**If the database is genuinely unavailable the app still runs.** Pages that
read data show a setup screen naming the commands; pages that need no data —
fees, the policies, sign-in — keep working. And when the database comes back,
requests recover on their own without restarting the server.

### Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Development server |
| `pnpm build` / `pnpm start` | Production build and server |
| `pnpm lint` | Biome check across the repo |
| `pnpm db:up` / `pnpm db:down` | Start / stop the Postgres container |
| `pnpm db:up:native` / `pnpm db:down:native` | Start / stop a local cluster instead of Docker |
| `pnpm db:seed` | Reset and repopulate from the fixtures |
| `pnpm db:migrate` | Create and apply a migration (needs a TTY) |
| `pnpm db:reset` | Drop, re-migrate, reseed |
| `pnpm db:studio` | Prisma Studio |
| `pnpm e2e` | Every end-to-end suite against `localhost:3000` |
| `pnpm typecheck` | TypeScript, no emit |
| `pnpm test:repo` | Data-layer tests against the live database |
| `pnpm test:auth` | Sign-up, sign-in and privilege-escalation checks |
| `pnpm test:seller` | Listing lifecycle, ownership scoping, money round-trip |
| `pnpm test:admin` | Moderation, duplicate detection, the audit trail |
| `pnpm test:settings` | Fee changes, bounds, and that history is not rewritten |
| `pnpm test:offers` | Negotiation, turn-taking, and the reservation race |
| `pnpm test` | Lint, typecheck and all of the above |

`BASE=http://localhost:3287 pnpm e2e` runs the suites against a production
build instead.

### Seeded accounts

All seeded users share the password `channeladda-dev-2026`.

| Email | Role |
| --- | --- |
| `admin@channeladda.com` | Superadmin |
| `moderator@channeladda.com` | Moderator — listings, KYC, reports |
| `finance@channeladda.com` | Finance — withdrawals, refunds, payouts |
| `arman-karimov@example.com` (and 13 more) | Sellers |

### Seeded marketplace

48 live listings across five platforms, 1,524 completed orders spanning two
years, and ~$39M of settled volume. Every headline figure on the site is
derived from those rows rather than written into the copy, so the numbers can
never contradict each other.

---

## How the code is laid out

```
src/
  app/(site)/      public marketplace pages, sharing the marketing chrome
  app/(auth)/      sign-in, sign-up, password reset — no marketing chrome
  components/      ui/ primitives, then one folder per feature area
  server/          the only place that talks to the database
  lib/             filters, currency, fees, the Prisma client
  data/            seed fixtures and static copy (platforms, help, legal)
prisma/            schema, migrations, seed
e2e/               end-to-end suites, one per feature area
```

### Accounts

Better Auth handles sign-up, sign-in, password reset and email confirmation.
The handler is mounted at `/api/auth`; `src/lib/auth.ts` is the configuration
and `src/server/session.ts` is what pages use:

```ts
const user = await requireUser("/dashboard"); // redirects to /signin if absent
const staff = await requireRole("FINANCE");   // 404s for the wrong role
```

**No email provider is connected yet.** `src/server/mailer.ts` prints
verification and reset links to the server log in development, and throws in
production rather than silently dropping them — so a reset link that goes
nowhere fails loudly instead of quietly.

Two things about `User` are worth knowing before editing it: **passwords are
never stored there** (they live on `Account`), and `role`, `kycStatus`, `slug`
and `bannedAt` are declared `input: false` in the auth config so the public
sign-up endpoint cannot set them.

### Uploaded files

Stored on local disk under `.data/uploads/` and served through
`/uploads/[...path]`, **not** from `public/`. Anything in `public/` is served
straight off disk with no code in front of it, which is fine for artwork but
wrong for proof screenshots and identity documents — those need a permission
check, and the route handler is where it will go.

`src/server/storage.ts` is the seam. Moving to ImageKit later means rewriting
that one file.

Uploads are identified by **reading their bytes**, not by the `Content-Type`
the browser claims — that is just a string in the request. PNG, JPEG, WebP and
GIF are accepted up to 8MB. SVG is refused outright: it can carry script, and
serving user-supplied SVG from our own origin would be a cross-site scripting
hole. Stored names are generated, never taken from the upload.

### Seller listings

`src/server/seller-listings.ts` is the only way in. **Every function takes a
`sellerId` and filters on it** — deliberately there is no lookup that skips the
owner check, because the moment one exists someone will call it with an id from
the URL. A listing that is not yours is indistinguishable from one that does not
exist.

Status transitions are guarded rather than assumed:

```
DRAFT ──submit──▶ CODE_CHECK ──seller confirms──▶ ADMIN_REVIEW ──▶ LIVE
  ▲                    │                              │            │
  └────────────────────┴──────────withdraw────────────┘      pause ▼
                                                              PAUSED
```

Only `DRAFT` and `REJECTED` are editable. Asking for an ownership code twice
returns the same code rather than issuing a new one — a seller may already have
pasted it into their bio.

### Moderation

`src/server/admin-listings.ts` is deliberately a separate module from
`seller-listings.ts`. That one scopes every query to one seller; this one does
not, and keeping them apart means an unscoped query can never be reached from a
seller-facing path by accident.

Two rules that are easy to break later:

- **Every staff action writes an audit row** through `src/server/audit.ts`,
  naming the actor. Rows are never updated or deleted — an audit trail that can
  be edited is not one, so no helper exists to do it.
- **The role check lives in the action, not the page.** The admin layout guards
  the route group, but that only decides what is drawn. `requireRole` runs
  inside every action before any work happens.

### Offers

The one rule worth knowing before touching `src/server/offers.ts`: **accepting
an offer is a compare-and-set, not a read-then-write.**

```ts
const reserved = await tx.listing.updateMany({
  where: { id, status: "LIVE" },   // only matches while still available
  data: { status: "RESERVED" },
});
if (reserved.count !== 1) throw new Error("listing-taken");
```

Checking the status and then writing would let two simultaneous accepts both
succeed, and two buyers would each be told the account is theirs. The test
suite fires two accepts at once and asserts exactly one wins.

Offer expiry is derived on read rather than swept by a job — there is no
scheduler here, and an offer that stays acceptable because nothing marked it
expired is a real way to lose money.

### The dashboard shell

`src/components/dashboard/app-shell.tsx` is the application chrome for both the
member area and the staff area — one interface, two navigation configs. It is
deliberately **not** `SiteChrome`: marketing chrome belongs on a shop window.

Two things to know before adding a page:

- **Do not add your own page wrapper.** The shell owns width and padding.
  Compose from `page-parts.tsx` and start with `<PageHead>`.
- **A sidebar badge counts only what is waiting on that person.** Not totals,
  not unread. A badge that is always lit stops meaning anything, and then the
  one that matters gets ignored too.

The layout uses `getCurrentUser()` rather than `requireUser()`: a layout does
not know which page is rendering inside it, so redirecting from there would
drop the return path. Each page calls `requireUser("/its/path")` and that
redirect wins.

**`src/server/` is the boundary.** Pages call it; it returns plain application
types. Nothing else imports Prisma, and every module there is marked
`server-only` so a stray client import fails loudly rather than leaking the
database into the browser bundle.

### Two rules worth knowing before editing

**Fee rates are not constants.** They live in `PlatformSettings` and a
superadmin changes them at `/admin/settings`. Every calculation in
`src/lib/fees.ts` takes the rates as an argument — deliberately, because with a
module-level constant it is far too easy to add a call site that quietly keeps
using the old number. Rates are basis points (300 = 3.00%) so they stay
integers.

Client components receive the rates as props from their server parent; there is
no global fee context. An Order records the fee it was **charged**, in cents, so
changing a rate never rewrites a sale that already happened.

**Money is stored in integer cents** and converted to dollars at the
`src/server` boundary. Never introduce a float into a price path.

**Filters live in the URL.** `/browse?platform=youtube&price_min=5000&sort=price-asc`
is the whole state — shareable, back-button-correct, and server-rendered. The
shapes live in `src/lib/listing-query.ts`; the querying lives in
`src/server/listings.ts`. There is deliberately only one implementation of the
filtering rules.

---

## Where the project is

See `PLAN.md` for the phase-by-phase plan and what is done.
#   c h a n n e l a d d a  
 