# Rating points and the Reseller badge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** Every member earns rating points from completed deals (50% of each deal's worth in USD), shown on their profile and to the other side of a deal; a paid "Reseller" badge ($20 for 30 days, from the wallet or by Cryptomus) shows beside their name, triples their points while active, and takes 30% off every Channel Adda fee they pay.

**Spec (the owner's words, 2026-10-20):** rating points visible on buyer and seller profiles, earned automatically from deals — a $500 deal earns 250 points. Normal members show no badge. The Reseller badge shows publicly beside the name, costs $20 a month, multiplies points by 3 at once (250 → 750) and gives a 30% discount on admin fees automatically; paid from the wallet or directly by Cryptomus.

**Owner's answers (2026-10-20):** 3x applies only while the badge is active, so points fall back to normal when it lapses. Each purchase adds 30 days, paying early extends it, and a reminder goes out 3 days before the end; there's no auto-renew. The discount covers every fee the holder pays: the buyer fee when buying, the seller fee when selling. The price, discount and multiplier are admin settings, defaulting to $20 / 30% / 3x.

## Design

- **Points are derived, not stored:** `floor(worth / 2)` in whole dollars over completed deals as buyer or seller, from `trackRecord`, then × multiplier while a pass is active. Retroactive for free, cannot drift, cannot be edited.
- **Passes:** `ResellerPass { userId, startsAt, endsAt, amountUsd, reference @unique, paidVia, remindedAt }`. Active = any pass with `startsAt <= now < endsAt`. A new pass starts at the latest `endsAt` (or now) and lasts `RESELLER_DAYS = 30`.
- **Paying:** one purchase function, from the balance (Serializable, re-checks available, `BADGE_FEE` debit of the member + `BADGE_FEE` credit of the platform, idempotent on `reference`). Cryptomus = an invoice of purpose `BADGE` that, when settled (webhook or sweep), is credited to the balance as a deposit and then spent on the pass with the invoice reference — so money that cannot buy a pass (the price changed meanwhile) simply stays in the balance.
- **Discount:** `createDeal` applies the buyer's and the seller's active pass to the rates before `orderAmounts`; the quote on the listing and the start-deal panel use the viewer's own rates.
- **Reminder:** the cron sweep tells the holder (notification + email) once, 3 days before their last pass ends.
- **Money desk:** badge income is a fee line of its own and counts in the month's revenue.

## Global constraints

- Hand-written migrations on `_test`, `_e2e`, `_demo` only. Payment code keeps compare-and-set and idempotency.
- No badge or points claim may be made in copy that the code does not do.

## Tasks

1. `src/lib/reseller.ts` (pure): `ratingPoints`, `withResellerDiscount`, `nextPassPeriod`, defaults. Tests.
2. Schema + migration: `ResellerPass`, settings fields, `LedgerKind.BADGE_FEE`, `InvoicePurpose.BADGE`.
3. `src/server/reseller.ts`: status, purchase from balance, Cryptomus checkout + settlement (webhook, reconcile), rating for a user, reminder sweep. Fee discount in `createDeal`. Tests.
4. UI: badge beside names (profile, listing seller panel, sellers list, home top sellers, chat header), points on profile/track record, dashboard card to buy/extend, admin settings fields, admin user detail. Money desk line.
5. Verify: suite, tsc, biome, build, screenshots; fresh review; fix pass.

## Review focus

1. Paying twice for one pass (double click, webhook + sweep, retries) — one pass, one debit.
2. A balance too small, or spent concurrently — refused, nothing written.
3. A pass bought while another is active — extends from its end, never overlaps or shortens.
4. The fee discount on a deal opened by a badge holder — applied once, to the right side, and recorded in the order's amounts (so it never changes after).
5. An expired badge — no badge shown, points back to 1x, full fees.
