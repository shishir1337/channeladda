# Channel Adda — build-out tracker

Running state of the autonomous build. Branch `feat/agent-custody`.
Spec for phase 1: `docs/superpowers/specs/2026-10-17-agent-custody-design.md`.
Deployment: `docs/deployment.md`.

## The model, in one paragraph

Two deal modes with mirror-image protections. **Safest**: the buyer pays
Channel Adda the admin fee only; a staff agent takes Google ownership of the
channel; once the agent verifiably owns it the buyer pays the seller
**directly**; the agent then transfers ownership to the buyer. Two Google
waiting periods. **Fastest**: the buyer pays price + fee to Channel Adda, the
agent supervises while the seller promotes the buyer to owner, and the
platform credits the seller's wallet. One waiting period.

Invariants: a user's balance is `SUM(LedgerEntry.amountUsd) WHERE userId = X`;
platform rows carry `userId: null`; a Safest deal never gets a ledger row for
the channel price; nothing advances before the opening payment clears; one
payment has exactly one name.

## Done

- [x] **Phase 1 — Agent custody and the two deal modes.** Transition table,
      step templates, fee arithmetic, schema + migration, test harness,
      creation/payment/advancement/resolution, agent cap and second approval,
      audit trail, admin feed, actions, buyer and admin UI.
- [x] **Phase 2 — Cryptomus and the clock.** Pure signing module (PHP-style
      slash escaping), API client, confirmed webhook, `POST /api/cron` sweep.
- [x] **Phase 3 — Wallet.** Deposits idempotent on `LedgerEntry.externalRef`,
      a balance page, paying a deal from balance, seller withdrawals against
      `PayoutAddress`, the finance queue, an admin-set withdrawal minimum, and
      a 24-hour lock after a payout address changes.
- [x] **Phase 4 — Per-mode copy.** Rewritten across the marketing pages, the
      legal pages, the help centre, the FAQ, the auth shell, the platform
      landing pages and the listing page. `/fees` shows one worked-example
      table per mode; the affiliate and home-page figures read the live rates.
- [x] **Phase 5 — Auth.** Google OAuth and the `two-factor` plugin, both behind
      env vars: with no Google credentials the button is not rendered and
      password sign-in is unaffected. TOTP 2FA works without an email provider.
- [x] **Phase 6 — Chat.** Two-pane layout, an automatic opening message, media
      to 25MB, 48h media expiry, 10d message retention with carve-outs for
      deals, disputes and flagged threads.
- [x] **Phase 7 — YouTube listing wizard.** Channel-link autofetch, the handle
      taken from the link, a `description` field, yearly revenue, staff-only
      WhatsApp, and an ownership code the seller places in their channel
      description. Degrades to typed figures without a YouTube API key.
- [x] **Three adversarial reviews and the fix pass.** 14 Critical defects
      across the money path, the custody state machine and the public copy.

## What the three reviews found, and what was done

**Money path.** One payment had three names — Cryptomus's uuid in the webhook,
our own reference in the sweep, a typed txid from finance — so whichever
caller ran second saw a stranger and credited the buyer the whole deal out of
nothing, withdrawable. A payment that could not be applied threw for ever and
was never written down anywhere. `markApplied` ran even when nothing had been
applied, which discarded Cryptomus's retry *and* hid the invoice from the
sweep that exists to catch that. The sweep had no underpayment check. A
processor refund was filed with invoices that were never paid, so the deal
completed and paid the seller out of money that had gone back.

**Custody.** `resolveDeal` could complete a live deal with no step, no
handover and no second approval — reachable by the assigned agent. The guard
against handing a channel back read the seller's own say-so rather than the
buyer's recorded payment, and its mirror image had no guard at all. Opening a
deal is free and either party may dispute one, so two calls took any listing
off the market permanently.

**Access.** Anyone could strip any listing's verified badge. Agents could read
every upload on the platform. A chat attachment did not have to be yours. A
seller could be the agent on their own sale. Verification never checked the
handle, so a listing could publish "@MrBeast ✓ Ownership verified".

**Copy.** The escrow rewrite had been done where the word appeared and missed
everywhere the promise was made in other words — the help centre's lead
article, the home page's four-step explainer, the Terms, the platform landing
pages. `/fees` built one table from two modes, so no row described a real
deal. Three protections the help centre promised did not exist in code.

## Decisions taken, and what they cost if wrong

- **A dispute resolved to `COMPLETED` still pays the seller without checking
  that anything transferred.** That is adjudication, not a bug: a moderator
  deciding in the seller's favour is exactly what the power is for. Cost if
  wrong: a moderator can pay a seller who did not perform. Mitigated by the
  audit row and by `COMPLETED` now being reachable only from `DISPUTED`.
- **The second staff approver on a high-value handover is an attestation.**
  `approvedById` arrives from the client and is checked only for "is staff,
  not banned, not me". A real two-person control needs the second person to
  act in their own session. Cost if wrong: one compromised agent account can
  release a high-value payout. This is a feature, not a fix.
- **`minWithdrawalUsd` is read through a 10-second per-process cache**, so
  raising the floor takes up to ten seconds to apply on other workers. It is a
  policy threshold, not a money-safety check.
- **A second payment is credited only against a settled `Invoice` row.** A
  genuine second payment with no invoice is audited and otherwise ignored, for
  finance to handle. Cost if wrong: a rare real duplicate needs a human.
- **Cancelling a paid deal is finance's only on Fastest.** On Fastest we
  hold the whole price, so Cancel is a refund under another name and sits
  behind the same gate. On Safest it returns the admin fee at most, and
  stays with moderators like every other fee-sized move. Cost if wrong: a
  moderator can return a buyer's fee without finance.
- **An invoice is given up only on an HTTP 404 from Cryptomus.** Confirmed
  against the live API on 2026-10-17: an unknown invoice is a 404 `Not
  found`. Anything else is retried, one lookup each per sweep, rather than
  written off.
- **Suspending a seller pauses their reserved listings too**, and their
  deals carry on for staff to finish. Resume is refused while a deal on the
  listing is still running, so lifting a suspension mid-deal cannot put
  the channel back on sale. Cost if wrong: a seller whose suspension was
  lifted waits for the deal to end before relisting.
- **Balance corrections are capped, not approved.** Finance can credit up
  to $500 per member per rolling 24 hours, $100,000 per correction for
  anyone; above the first, a superadmin makes it. A two-person approval
  would be stronger and is a feature, not a fix.

- [x] **A fourth review, of the fix pass itself.** Three Criticals, two of
      them regressions the fix pass introduced: a `handoverAt` guard that made
      refunding a Fastest deal impossible in the only state it is reachable
      from, a `buyerPaidAt` guard that stranded a seller's channel on an
      unverified buyer claim, and a compare-and-set miss that dropped a cleared
      payment with no ledger row. Both guards are now routed through a dispute
      rather than refused outright; the third re-reads and decides.
- [x] **The dashboards, rebuilt.** Four parallel passes: the deal page, deals
      and offers lists and messages; the overview, wallet, security and the
      shell; the selling flow and the listing wizard; and the staff area as an
      operations console. The activity-feed leak — hidden from agents with
      CSS, so the whole marketplace's deal history sat in their HTML — is now
      neither fetched nor rendered for a non-staff viewer.
- [x] **Email.** `sendMail` speaks SMTP, so password reset, verification and
      the turn-taking notification can actually leave the building. With no
      `SMTP_HOST` the behaviour is exactly what it was.
- [x] **`pnpm verify:integrations`.** One command that proves the credentials
      in front of you work, rather than that the code matches the contract.
- [x] **Notifications for everyone.** A bell and a page for every member and
      every desk: offers, messages (folded per thread), listing decisions,
      deal turns, payouts, disputes. Staff are told when a desk has work.
      Email only for things that stall if ignored, and only with SMTP set.
- [x] **An admin a non-technical operator can run.** Team (invitations by
      link, roles, an agent's one transfer identity), member support (identity
      check, two-step reset, email verification, sign out everywhere), a
      money desk (position, balances, CSV exports, capped corrections, retry
      one invoice), a dispute desk (both sides' evidence, staff notes,
      contact), listing moderation that can be undone (reopen, feature), a
      reassign pick-list of real agents, and the sweep's last run on the
      overview. Operator settings: payment window, minimum withdrawal.
- [x] **Business-logic review and fixes.** An accepted offer now becomes a
      deal at the agreed price and lapses if unpaid; the Fastest recovery hold
      is enforced; the agent cap counts disputed custody; cancelling a paid
      Fastest deal is finance's; the reconcile sweep rotates and never writes
      off an invoice it could not ask about; checking an ownership code can no
      longer undo a takedown or skip review; a takedown cannot overwrite a
      reservation; a suspension cannot be used to relist mid-deal; fake
      testimonials replaced by real reviews.
- [x] **Lint is a gate now.** Biome's own config, clean across `src` and
      `scripts`.

## Verification, as of the last commit

| Check | Result |
|---|---|
| `pnpm test` | 382 passing, 36 files |
| `pnpm typecheck` | clean |
| `pnpm lint` | clean |
| `pnpm build` | clean |
| `scripts/e2e-routes.sh` | 131/131 against the production build: every page, every role, including the team, money and dispute desks and both CSV exports |
| `pnpm verify:integrations` | database ok; YouTube, Google and email correctly reported unconfigured; the sweep reported broken only because `CRON_SECRET` is unset on this machine |
| Cryptomus, live keys (2026-10-17) | signed requests accepted; a $1.00 invoice raised and read back by `order_id` (status `check`); an unknown invoice is HTTP 404; every field the code reads exists under the name it reads. Webhook registration fails only because this machine is not a public https origin |
| Browser | checkout, listing wizard and `/fees` driven by hand in an earlier round; the new desks not yet |
| Final review | a fresh reviewer read this round's commits; two Important findings fixed with tests (a second payment the sweep confirmed was booked nowhere; a demoted agent kept their deals), two Minor deferred below |


## Still to do

- **The dev password is in this branch's history.** `scripts/e2e-routes.sh`
  hardcoded it and was committed; it is out of HEAD but present in the trees
  of ~19 commits from `58a63cf` on. Rewriting history needs a force push and
  is the owner's call before merging.
- **Cryptomus: the inbound half.** Outbound calls work with the live keys.
  What has not met the real service is a callback: `verifyWebhookSign` has
  never checked a signature Cryptomus produced, and no real payment has
  gone end to end. Both need a public https origin (staging or production)
  with `NEXT_PUBLIC_SITE_URL` set to it, then Cryptomus's test-webhook call
  and one small real payment.
- **The live keys live in `.env.cryptomus`, on purpose not in `.env`.**
  `next dev` and Vitest both read `.env`; live keys there would make local
  checkouts and any unmocked test raise real invoices. Load them only for a
  deliberate check: `set -a; . ./.env.cryptomus; set +a; pnpm
  verify:integrations`. Production sets them in the host's environment.
- **Google sign-in, the YouTube API and SMTP have not met a live service.**
  Written to their published contracts and tested against fakes; each needs
  one `pnpm verify:integrations` run with the owner's credentials.
- **A browser pass over the new desks.** They are covered by tests and the
  route sweep (every page, every role), not yet clicked through by hand.
- **Deferred from the final review (Minor).** The last-superadmin guard is
  read-then-write, so two superadmins demoting or suspending each other at
  the same instant could leave none (`scripts/create-admin.ts` recovers).
  And a moderator can suspend or sign out an agent, which halts their
  custody work until a superadmin reverses it — audited and reversible, but
  whether moderators should hold that power is the owner's call.

## What needs the owner, and cannot be faked

| Needs | For | Without it |
|---|---|---|
| `CRYPTOMUS_MERCHANT_ID` + `CRYPTOMUS_PAYMENT_KEY` | charging buyers, deposits | received 2026-10-17 and working; still to be set on the production host |
| `CRON_SECRET` | the sweep | abandoned deals hold listings; offers never expire; media is never purged; orphaned uploads are never collected |
| Google OAuth client id + secret | "Continue with Google" | password sign-in only |
| YouTube Data API key | channel autofetch and code verification | the seller types the figures, a moderator checks the channel |
| An email provider | password reset, verification, 2FA by email | `src/server/mailer.ts` throws; TOTP 2FA still works |
| Domain-ownership documents | Cryptomus merchant review | the account stays unverified |

Integrations are written against the published contracts and unit-tested.
Cryptomus's outbound half is now proven with live keys: the request
signature, slash escaping included, is accepted, and invoice lookups return
the fields the code reads. `verifyWebhookSign` round-trips the body through
`JSON.parse`/`JSON.stringify` — correct for the documented format, but it has
never met a real callback. One live observation: an unpaid invoice reports
`payment_amount_usd: "0"`, which is harmless because the underpayment check
only runs once the status is settled. The other integrations have no
credentials here yet. All of this is stated rather than hidden.

## Standing rules for this run

- Every change lands with tests, `pnpm typecheck` and `pnpm build` green.
- Run `pnpm exec next typegen` after adding a route, or `PageProps` fails.
- Never commit a credential. Never push, merge or deploy.
- Heredocs over ~150 lines get truncated by the harness: write edit scripts to
  the scratchpad and run them by path.
- A new column needs the migration applied to both `DATABASE_URL` and
  `DATABASE_URL_TEST`, and the table adding to `TABLES` in `src/test/db.ts`.
- `scripts/e2e-routes.sh BASE JARS` needs the server's `BETTER_AUTH_URL` to
  match the URL swept, or every sign-in is a 403 and every check a redirect.
  It also needs `E2E_PASSWORD` in the environment — the seeded accounts'
  password is not written down in a committed file.
