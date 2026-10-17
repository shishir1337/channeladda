# Dashboard revamp — design

**Status:** owner asked for it and handed over every call ("completely revamp …
make this a minimalistic masterpiece … you can take decisions"). Everything
below that is not a quote is my call.

## Why

The owner's words: the dashboards for admins, agents, buyers and sellers are
"bad ui bad ux, too much looks unorganised, no attentions to details". They
want "clean, minimalistic, modern … enterprise grade", easy to understand for
every journey, with "every section every component, animations, effects, hover
state … perfect with tiny small attention to details".

What the audit of the current screens found, in order of how much it hurts:

1. **Three type families and shouting labels.** Space Grotesk black headings,
   Inter body, and JetBrains Mono uppercase tracked eyebrows on every label,
   stat, table head and group. Everything is emphasised, so nothing is.
2. **Colour as decoration.** Gold active nav, gold tabs, gold count pills,
   gold-tinted "waiting" panels, filled green/red/gold stat cards, a big green
   "all caught up" banner. Colour stopped carrying meaning.
3. **Heavy containers.** 16–24px radii, nested bordered boxes, 44–56px
   controls on a desktop tool — a marketing page's proportions.
4. **Prose everywhere.** A paragraph under every header and section.
5. **Inconsistent parts.** Two parallel kits (`dashboard/page-parts`,
   `admin/console`) plus page-local copies of cards, rows and empty states.

## Goals

- One quiet, dense, consistent system for all four journeys (member as buyer
  and seller, agent, staff), light and dark.
- The next action is always the most visible thing on a page; everything else
  recedes.
- Every interactive element has a designed hover, focus, active, disabled and
  (where it applies) loading and empty state.
- Works at 360px wide; touch targets stay ≥ 44px on coarse pointers.

## Non-goals

- No behaviour, data, route, permission or copy-meaning changes. Copy may be
  shortened (descriptions trimmed to one line) but never changes what it
  claims.
- Marketing pages, auth pages and emails are untouched. The new tokens are
  scoped to the app shell so the public site renders exactly as before.
- No new dependencies.

## Anti-goals (a failure even if it "works")

- A generic template look: grey-on-grey with no hierarchy.
- Breaking any flow the deal chat or deal desk relies on.
- Removing information staff use to triage (counts, ages, references).

## Design language

Linear / Vercel / Stripe restraint. Monochrome neutrals; colour only for
meaning; borders over shadows; one type family; tabular numerals.

### Scope mechanism

`AppShell` renders `data-app` on its root. Tokens are redefined under
`:root:has([data-app])`, so portalled menus and sheets inherit them and the
marketing site (no `data-app`) is untouched. A Tailwind variant `app:` targets
the same scope, so shared components (`Button`, `Badge`, fields, tabs) can be
dense inside the app and keep their marketing proportions outside it.

### Tokens (app scope)

| Token | Light | Dark |
|---|---|---|
| canvas `--db-bg` | `#fafafa` | `#09090b` |
| surface | `#ffffff` | `#111113` |
| surface-2 (hover, wells) | `#f4f4f5` | `#18181b` |
| surface-3 (pressed) | `#ebebed` | `#212124` |
| border | `#e8e8eb` | `#232326` |
| border-strong | `#d6d6db` | `#323238` |
| fg | `#18181b` | `#ededef` |
| muted | `#52525b` | `#a1a1aa` |
| subtle | `#71717a` | `#80808a` |

Gold `#ffb020` stays the brand: primary buttons, focus ring, "your move"
signals and waiting counts. Green, blue and red are status only.

Radii: controls 8px, cards 12px, pills full. Shadows: `xs` only on cards and
the active nav chip; `lift` only on floating layers (menus, sheets, popovers).

### Type

Inter everywhere in the app, including headings (`--font-display` resolves to
Inter in scope). Mono only for references, IDs and addresses. `.tnum` keeps
tabular figures but uses Inter.

| Role | Size / weight |
|---|---|
| Page title | 22px / 600, tracking -0.02em (20px on phones) |
| Section title | 15px / 600 |
| Card title | 14px / 600 |
| Body | 14px / 400 |
| Secondary | 13px / 400 muted |
| Meta, captions, table heads | 12px / 500 subtle, sentence case |
| Metric value | 26px / 600, tabular |

No uppercase tracked labels anywhere in the app.

### Density

Buttons 32 (sm) / 36 (md) / 40 (lg) px on fine pointers, 44px on coarse.
Inputs 36px (44 on coarse). Nav items 32px. Table rows ~44px. Page gutter
16 / 24 / 32px. Content max width 72rem. Vertical rhythm: 24px between page
header and content, 32px between sections, 12px inside section heads.

### Motion

150ms colour transitions on every hover; 200ms ease-out for the sidebar
width, chevrons and menus; page content fades and rises 4px over 220ms when
moving between sections (a `template.tsx` per area); skeletons pulse while a
route loads (`loading.tsx` per area). All of it collapses under
`prefers-reduced-motion`.

### Shell

- Sidebar 240px (56px collapsed, remembered), canvas-coloured, hairline right
  border. Brand at top; staff area shows a quiet "Staff" pill beside the
  wordmark instead of a blue banner. Group labels 12px subtle sentence case.
  Items 32px: icon 16px + label; hover surface-2; active = white chip with a
  hairline ring and `xs` shadow (dark: surface-2 chip). Waiting counts are a
  small gold-tinted pill. Footer: back to marketplace, collapse.
- Top bar 56px, canvas at 80% with blur, hairline bottom border. Left:
  breadcrumb "Group / Page". Right: bell, theme, account — 32px ghost icon
  buttons, no borders.
- Phones: the menu button opens the same nav in a sheet from the left.

### Components (one kit, `src/components/app/`)

`PageHeader`, `Section`, `Card` (+ header/body/footer), `Stat` + `StatGrid`,
`List` + `ListItem`, table parts, `FilterBar` + `FilterLink` (segmented),
`EmptyState` (neutral and "all clear"), `Callout` (info / warning / danger /
success), `Facts` + `Fact`, `IconTile`, `Skeleton`, `Amount`, `Reference`,
`TurnFlag`. `dashboard/page-parts` and `admin/console` become thin
re-exports of these so every page moves at once, then each page is rebuilt
on the kit directly.

Rules every page follows:

- One page header: title, at most one line of description, actions on the
  right. No eyebrows.
- Cards never nest. A section is a heading plus one card (or a grid of
  cards), not a card containing cards.
- Stat cards are neutral. Tone shows as a 6px dot and, for danger only, the
  value colour. Linked stats show an arrow on hover.
- Status is a tinted pill (`Badge`), never a filled block.
- Lists and tables are the default for collections; row hover is
  surface-2/60; the whole row is the link when there is one destination.
- Empty states: icon tile, one-line title, one-line body, one action.
- "Nothing waiting" is a quiet inline line with a green check, not a banner.

## Delivery

1. Foundation: tokens, `app:` variant, kit, restyled shared controls, new
   shell, compatibility re-exports. Committed alone, screenshot-checked.
2. Pages, in parallel by owners with disjoint files: member overview and
   wallet; deals and offers; messages and the deal panel; listings and the
   listing form; admin overview, deal desk and money; admin people, team,
   moderation, support, settings.
3. Polish pass over screenshots of every page, both themes, desktop and
   phone width.
4. Full verification (tests, typecheck, lint, build, route sweep), a fresh
   reviewer, commit.

## Left to the builder

Exact spacing inside individual pages, which local helpers to fold into the
kit, icon choices, and trimming descriptions to one line.
