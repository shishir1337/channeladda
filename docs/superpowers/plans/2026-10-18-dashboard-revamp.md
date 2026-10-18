# Dashboard revamp — plan and page brief

**Spec:** `docs/superpowers/specs/2026-10-18-dashboard-revamp-design.md` (read
it first — the "Design language" and "Rules every page follows" sections are
binding).

**Foundation (done, commit fe07763):** app-scoped tokens in `globals.css`,
the `app:` Tailwind variant, `src/components/app/kit.tsx`,
`src/components/app/user-menu.tsx`, the new `AppShell`, restyled `Button`,
`Badge`, `auth/fields`, `ui/sheet`, `ui/empty-state`, `ui/pagination`,
`NotificationBell`. `dashboard/page-parts.tsx` and `admin/console.tsx` are
now aliases over the kit.

## Phase B — pages, one owner per group

Each owner rebuilds the markup of the files they own on the kit. Files are
disjoint: **edit only the files in your group.**

| Group | Files |
|---|---|
| B1 Member home, account, wallet | `src/app/(dashboard)/dashboard/page.tsx`, `dashboard/notifications/page.tsx`, `dashboard/security/page.tsx`, `dashboard/wallet/page.tsx`, `src/app/(dashboard)/not-found.tsx`, `src/components/dashboard/mark-all-read.tsx`, `src/components/dashboard/wallet-panels.tsx`, `src/components/auth/two-factor-setup.tsx` |
| B2 Member deals and offers | `dashboard/deals/page.tsx`, `dashboard/deals/[id]/page.tsx`, `dashboard/offers/page.tsx`, `src/components/deals/*` (`deal-timeline`, `pay-now`, `pay-to`, `agent-invite`), `src/components/dashboard/offer-card.tsx` |
| B3 Messages (member and staff) | `dashboard/messages/layout.tsx`, `dashboard/messages/page.tsx`, `dashboard/messages/[id]/page.tsx`, `src/app/(admin)/admin/messages/page.tsx`, `admin/messages/[id]/page.tsx`, `src/components/messages/*`, `src/components/offers/offer-actions.tsx` |
| B4 Member listings | `dashboard/listings/page.tsx`, `dashboard/listings/new/page.tsx`, `dashboard/listings/[id]/page.tsx`, `src/components/dashboard/listing-form.tsx`, `listing-actions.tsx`, `listing-status.tsx`, `channel-import.tsx`, `ownership-check.tsx` |
| B5 Staff overview, deal desk, disputes | `src/app/(admin)/admin/page.tsx`, `admin/deals/page.tsx`, `admin/disputes/page.tsx`, `src/components/admin/deal-controls.tsx`, `stuck-deals.tsx`, `dispute-case.tsx`, `dispute-contact.tsx`, `dispute-note.tsx`, `report-queue.tsx`, `vocab.tsx` |
| B6 Staff money | `admin/money/page.tsx`, `admin/money/adjust/page.tsx`, `admin/payouts/page.tsx`, `src/components/admin/money-parts.tsx`, `money-adjust-form.tsx`, `payout-decision.tsx` |
| B7 Staff people and team | `admin/users/page.tsx`, `admin/users/[id]/page.tsx`, `admin/team/page.tsx`, `src/components/admin/user-controls.tsx`, `team-controls.tsx` |
| B8 Staff moderation, support, settings | `admin/listings/page.tsx`, `admin/listings/[id]/page.tsx`, `admin/support/page.tsx`, `admin/settings/page.tsx`, `src/app/(admin)/not-found.tsx`, `src/components/admin/review-decision.tsx`, `ticket-card.tsx`, `settings-form.tsx` |

Shared and **not to be edited by any group**: `src/components/app/*`,
`src/components/ui/*`, `src/components/auth/fields.tsx`,
`src/components/dashboard/app-shell.tsx`, `page-parts.tsx`,
`notification-bell.tsx`, `src/components/admin/console.tsx`, both layouts,
`globals.css`, anything under `src/server`, `src/lib`, `prisma`, tests.
Need something the kit lacks? Write a small local component in a file you
own and say so in your report.

## The page brief (every group)

### What must not change

- Behaviour. Same data, same server calls, same actions, same props into
  client components, same form field `name`s, same `id`s used by anchors and
  `aria-*`, same links and routes, same conditions for what shows when.
- Meaning of copy. You may shorten text (one-line descriptions, trimmed
  helper paragraphs) and change case, but never what it claims or promises.
  Safety-critical copy (payment details warnings, "never pay outside",
  irreversible-action confirmations, legal/fee wording) stays word for word.
- Accessibility: keep every `sr-only`, `aria-label`, `role`, focus order and
  44px touch targets on coarse pointers (the kit and `Button` handle this).
- Long code comments explaining *why* — keep them; update a comment only if
  it describes markup you changed.

### The look

Import from `@/components/app/kit`:

- `PageHeader({ title, description?, actions?, meta?, back?: {href,label} })`
  — one per page. No eyebrows. Description ≤ one line.
- `Section({ id?, title?, description?, count?, tone?, actions?, children })`
  — headings 15px/600; `count` renders a pill; `SeeAll({href})` for "see all".
- `Card({ tone?, padded?, className })`, `CardHeader({ title, description?,
  icon?, actions? })`, `CardBody`, `CardFooter`. Cards never nest.
- `Stat({ label, value, note?, chip?, tone?, href?, icon? })` in
  `StatGrid({ columns?: 2|3|4 })`. Neutral; tone is a dot; only danger
  colours the number.
- `List` + `ListItem({ href?, flag?, padded? })` + `ListRow({ leading?,
  title, meta?, trailing?, chevron? })`, `Sep` for "a · b" meta lines.
- Tables: `TableCard` > `<table className="w-full">` with `<thead><tr>`
  of `Th({ numeric? })`, `<tbody>` of `Tr` > `Td({ numeric? })`.
- `FilterBar({ label })` + `FilterLink({ href, active, count?, tone? })` —
  underlined tabs; give the bar `className="mb-4"` (or similar) yourself.
- `EmptyState({ icon?, title, body?, action?, tone?: "neutral"|"success",
  bare? })`; `AllClear({ title, body? })` for a cleared queue (never a big
  green banner); `Callout({ tone: "neutral"|"info"|"warning"|"danger"|
  "success", title, children?, action?, icon? })` for page-level notices.
- `IconTile({ icon, tone?, size? })`, `Dot`, `Count`, `Facts`/`Fact`,
  `Amount({ cents })`, `Reference` (mono), `TurnFlag`, `MetaItem`,
  `Skeleton`.
- Hand-built inputs use `inputClass`, `textareaClass`, `labelClass`,
  `hintClass` (selects use `inputClass`). Prefer `TextField`/`TextArea` from
  `@/components/auth/fields` where they fit.
- `Button` (`@/components/ui/button`): `variant` primary (one per view — the
  next action), secondary, outline, ghost, danger; `size` sm for row and
  card actions, md for page actions. Never pass height/padding/text-size
  classes to it.
- `Badge` for status (`neutral|verified|primary|info|danger`), `size="sm"`
  in rows.

Type and colour rules (replace the old patterns wherever you find them):

| Old | New |
|---|---|
| `font-mono … uppercase tracking-[…]` labels | `text-xs font-medium text-muted` (or `text-subtle`), sentence case |
| `font-display` + `font-black`/`font-bold` headings | plain Inter: `font-semibold` (page 22px, section 15px, card 14px) |
| `rounded-panel`, `rounded-2xl`, `rounded-3xl` | `rounded-card` (12px) for surfaces, `rounded-lg` (8px) for controls/tiles, `rounded-md` for small bits |
| `shadow-soft` / `shadow-lift` on in-page cards | `shadow-xs` (the kit already does this) |
| filled tinted stat/panel backgrounds (`bg-verified-soft`, `bg-primary-soft` blocks) | neutral `Card`; tone as a `Dot`, a `Badge`, or a `Callout` |
| `text-primary-text` links everywhere | `text-fg` / `text-muted hover:text-fg`; gold only for "your move" and the primary CTA |
| `font-mono` on money/numbers | drop it — `tnum` and `tabular-nums` are Inter with aligned figures inside the app; `font-mono` only for references, IDs, addresses, codes |
| `text-[0.625rem]`/`text-[0.6875rem]` body text | min 12px (`text-xs`); 13px (`text-[0.8125rem]`) for secondary |
| `p-5 sm:p-6` big padding | `p-4 sm:p-5` |
| icon squares `size-9/11 rounded-xl bg-primary-soft` | `IconTile` (neutral unless it signals a turn) |

Interaction detail: every link row hovers (`ListItem href` does it), every
clickable card has a visible hover (border-line-strong + subtle bg),
chevrons nudge on hover (`group-hover:translate-x-0.5`), transitions 150ms,
disabled states at 50–60% opacity with `cursor-not-allowed`. Loading states
on buttons keep their width (show a spinner or "Saving…" without layout
jump). Respect `prefers-reduced-motion` (global CSS already does).

Responsive: check every layout at 360px — no horizontal page scroll; tables
scroll inside `TableCard`; action rows wrap; two-column layouts stack.

### Done means

1. `pnpm -s exec biome check --write <your files>` then `pnpm -s exec biome
   check <your files>` → clean.
2. `pnpm -s typecheck` → clean (other groups are editing in parallel; if an
   error is in a file you do not own, mention it and move on).
3. Grep your files: no `font-mono`+`uppercase` labels, no `font-display`, no
   `font-black`, no `rounded-panel`/`rounded-2xl`, no `shadow-soft`/`lift`
   on in-page cards.
4. Do not run tests, builds, dev servers or a browser; do not commit. The
   lead reviews screenshots and commits.
5. Report: files changed, anything you could not do, any copy you shortened
   (old → new, one line each), and kit additions you would want.

---

## Phase E — the calm pass (owner's feedback, 2026-10-18)

> "isn't it looks too much text based, nothing feels calm, texts everywhere?
> it's far better than the older version but still it can be best."

The structure is right; the pages still *read* like documents. Reference
designs (Dribbble/Behance SaaS dashboards) carry meaning with a title, a big
figure, a small visual and space — almost no sentences.

### New kit parts (commit d0d32ac)

- `info` prop on `PageHeader`, `Section`, `CardHeader`, `Stat`: an (i) beside
  the title that opens the explanation on hover, focus or tap
  (`InfoTip` in `src/components/app/info-tip.tsx` for anywhere else).
- `Disclosure({ title, bare? })`: a folded "How this works" block.
- `Meter({ value, max, label, tone })`, `SplitBar({ parts, label })`,
  `Ring({ value, max, label, tone, size, children })`: visuals built only from
  figures the page already has.
- Sections are now 40px apart and the page header 32px above content.

### Rules for every page

1. **Page description:** at most one short line (~60 characters) or none.
   Anything longer moves into `info` on the `PageHeader`, word for word.
2. **Section description:** none by default. Move it into `info` word for
   word — unless it is safety, money-at-risk, fee, legal or irreversible-
   action copy, which stays visible (a compact `Callout` is fine).
3. **Stat note:** at most ~5 words, or none. Meaning goes in `info`.
4. **Card header description:** one short line or none; the rest in `info`.
5. **Explainer blocks** (mode explainers, fee definitions, "how it works"
   lists, long notes under tables): fold into a `Disclosure`, or into `info`.
6. **Form hints:** keep the ones that prevent a mistake (format, limits,
   what will be shown to whom); move rationale into an `InfoTip` beside the
   label or drop it if it repeats the card's `info`.
7. **Empty states:** title plus at most one short line.
8. **Show, don't say:** where a page already has the numbers, add a visual —
   a `SplitBar` for a total and its parts, a `Meter` for progress or usage, a
   `Ring` for steps done. Never add a server call or query to feed one.
9. **Repeated sentences:** if the same explanation appears in two places on a
   page, keep one.
10. **Meta rows:** drop "Signed in as …" / "Desk …" / "Read …" chatter from
    staff headers unless it decides something (keep "Read" time only where a
    figure is time-sensitive, e.g. the money desk).

Everything moved into `info` or a `Disclosure` keeps its exact words. Copy
that is cut must be redundant (said elsewhere on the same page). Safety, fee,
legal and irreversible-action copy is never hidden and never reworded.
Behaviour rules from the page brief above all still apply.
