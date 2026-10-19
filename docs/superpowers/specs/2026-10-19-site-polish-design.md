# Public site polish — design

**Status:** owner asked for it and handed over every call: "just like you made
the dashboards UI UX perfect with proper attention to details … do it with the
frontend as well". Everything below that is not a quote is my call.

## Why

The dashboards were rebuilt on a quiet system (spec
`2026-10-18-dashboard-revamp-design.md`). The public site, sign-in pages and
listing pages still carry the old look, and the audit of every public page
(desktop and 390px phone, light and dark, against a seeded demo database)
found the same problems the dashboards had:

1. **Three type families.** Space Grotesk bold headings, Inter body, and
   JetBrains Mono for every number: prices, counts, "14 listings", ages,
   follower counts. Prices read like code.
2. **Shouting labels.** A gold uppercase tracked eyebrow with a rule line
   above almost every section and page title ("SHOP BY PLATFORM", "LIVE
   MARKETPLACE", "PRICING"), and uppercase stat labels ("DEALS SHOWN",
   "BUYER FEE", "HOW YOU WANT TO BUY").
3. **Colour as decoration.** Green on every revenue figure, a filled red
   block for the revenue notice, a filled green "Nobody can be left short"
   panel, green "After you confirm" on one card and not the other.
4. **Decoration standing in for hierarchy.** Floating platform icons, a grid
   backdrop and gradient blobs in the hero, a hand-drawn underline, gradient
   headline text.
5. **Heavy cards.** The listing card stacks cover, avatar, title, a
   four-cell bordered metric grid, a chip row and a price row with its own
   border: five boxes in one card, and a redundant "View" button.
6. **Uneven rhythm.** Alternating grey and white bands with hairlines, 96px+
   of padding, page headers on a grey band, so the page reads as stripes.
7. **Bugs and stale copy** (see "Fixes" below).

## Goals

- The public site, the auth pages and the dashboards read as one product:
  same palette, same type, same controls; the site keeps larger proportions.
- Every page has one clear next action, and it is the most visible thing.
- Every interactive element has designed hover, focus, active and disabled
  states; touch targets stay at least 44px; nothing scrolls sideways at 360px.
- Light and dark both checked on every page.

## Non-goals

- No change to behaviour, data, routes, permissions or what copy claims.
  Copy may be shortened. Copy that is wrong (listed under Fixes) is
  corrected.
- Dashboards and emails are not touched beyond what the shared tokens change.
- No new dependencies.

## Anti-goals

- A generic grey template with no hierarchy.
- Losing trust content: the safety explanation, fee clarity and the revenue
  notice stay exactly as prominent in meaning, just quieter in colour.
- Breaking the deal flow on the listing page.

## Design language

The same restraint as the dashboards: Linear, Vercel, Stripe. Monochrome
neutrals, colour only for meaning, borders over shadows, one type family,
tabular figures. A marketing site is read rather than scanned, so it gets a
bigger type scale and more air than the app, never more colour.

### Tokens

The neutral palette the app uses becomes the global default, so the site and
the app share one set. The app keeps only its density overrides (radii).

| Token | Light | Dark |
|---|---|---|
| bg | `#fafafa` | `#09090b` |
| bg-subtle | `#f4f4f5` | `#0e0e10` |
| surface | `#ffffff` | `#111113` |
| surface-2 | `#f4f4f5` | `#18181b` |
| surface-3 | `#ebebed` | `#212124` |
| line | `#e8e8eb` | `#232326` |
| line-strong | `#d6d6db` | `#323238` |
| fg | `#18181b` | `#ededef` |
| muted | `#52525b` | `#a1a1aa` |
| subtle | `#71717a` | `#80808a` |

Gold `#ffb020` stays the brand: the primary button, the logo mark, focus
rings, the "Featured" tag and the recommended choice. Green means verified or
completed. Blue means informational. Red means danger or a destructive
action, nothing else. Platform marks keep their brand tints.

Radii on the site: controls 10px, cards 12px, large panels 16px, pills full.
Shadows: none on resting cards; `lift` only on floating layers and on card
hover.

### Type

Inter everywhere, headings included. Space Grotesk is dropped. JetBrains Mono
stays only for codes and references (ownership codes, order references,
wallet addresses, the Cryptomus token). `.tnum` is Inter with tabular figures.

| Role | Size / weight / tracking |
|---|---|
| Hero headline | 56px / 600 / -0.035em (40px phone), line-height 1.05 |
| Page title | 40px / 600 / -0.03em (30px phone) |
| Section title | 32px / 600 / -0.025em (26px phone) |
| Card title | 16px / 600 |
| Lead | 18px / 400 muted (16px phone) |
| Body | 15–16px / 400 |
| Secondary | 14px muted |
| Meta and labels | 13px / 500 subtle, sentence case |
| Price on a card | 20px / 600 tabular |

No uppercase tracked labels anywhere. No eyebrows above headings: the heading
does that job.

### Rhythm

- Container max width 72rem (1152px) for text-led pages, 80rem for grids.
- One background. Sections are separated by space, not by bands: 96px between
  sections on desktop, 64px on phones. A band (`bg-subtle`) is allowed once
  per page, for the single section that should stand apart.
- Page header: breadcrumb, title, one or two lines of lead, actions right.
  No grey band, no bottom border. 48px top, 40px to content.
- Section heading: title, one line of description, optional action right.
  40px from heading to content.

### Motion

150ms colour transitions on hover; cards lift 2px with the `lift` shadow on
hover (no scale on artwork). Accordions and sheets as they are. Everything
collapses under `prefers-reduced-motion`.

### Components

- **Header:** 64px, bg at 80% with blur once scrolled, hairline bottom.
  Logo, nav (ghost links, 36px), right side: currency and theme as ghost
  controls without borders, Sign in as a ghost link, "Sell an account" as the
  one primary button. Phone: search, theme and menu as borderless 44px icons.
- **Announcement bar:** 13px muted on `bg-subtle`, dismissible as today.
- **Footer:** link columns 14px muted; the support block as one row of two
  quiet items; legal line 13px subtle; the Cryptomus line stays in the DOM in
  mono at 12px subtle.
- **Listing card:** cover (2:1) with the platform mark, tag and favourite;
  avatar overlapping the cover; title with the verified mark; "Platform ·
  niche"; the one-line description (2-line clamp); one row of three facts
  (audience, engagement, age) as label-over-value without cell borders; a
  quiet line for revenue ("$2,280 a month" in fg, or "Not monetized" in
  subtle) and country; footer: price (20px tabular) with the old price struck
  through when there is one, and "rating · seller · N sales" in 13px subtle.
  The whole card is the link; no "View" button. Watching count is dropped
  from the card (it stays on the listing page).
- **Stars:** filled to the rounded rating, outlined after; no stars at all
  when the seller has no reviews ("New" instead).
- **Callouts:** info / warning / success / danger as in the app kit: tinted
  surface, coloured icon, fg title, muted body. The revenue notice is a
  warning callout, not a red block.
- **Stat strips:** label over value, 13px subtle label in sentence case,
  value 24px/600 tabular, no per-stat card when they sit in one row.

## Fixes (wrong today)

1. Stars render five filled whatever the rating, including for "New".
2. "1 reviews", "1 sales": counts are pluralised properly.
3. Seller avatars on the home page and the sellers page point at
   `/media/sellers/{slug}.svg`, which exists only for the old fixtures; a real
   seller gets a broken image. They use the same avatar-with-initials
   fallback the seller page uses.
4. The FAQ still says "Quick and Safest checkout"; the modes are Fastest and
   Safest.
5. The fees page says the seller fee is "deducted from the sale price when
   the deal completes" even when it is 0%; at 0% it says there is no seller
   fee.
6. On a listing page the phone's sticky bar offers "Browse accounts / Sell"
   instead of the price and the way to buy.
7. The how-it-works page repeats its section label under its own title.

## Delivery

1. **Foundation** (one owner, committed alone): tokens, type, `Container`,
   `Section`, `SectionHeading`, `PageHeader`, `Button`, `Badge`, the header,
   announcement bar, footer, listing card, stars, a shared plural helper.
2. **Pages**, by owners with disjoint files: home; browse, sold, sellers and
   seller profiles; the listing page and its sticky bar; content pages (sell,
   how it works, fees, trust and safety, services, about, affiliates, listing
   rules, support, help, legal, 404); auth pages.
3. **Polish** over fresh screenshots of every page in all four variants.
4. **Verification:** tests, typecheck, lint, build, a fresh reviewer, commit.

## Left to the builder

Exact spacing inside sections, icon choices, which local helpers fold into
shared parts, and trimming copy that runs past two lines.
