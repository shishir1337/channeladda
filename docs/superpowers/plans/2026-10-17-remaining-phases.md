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

## Verification, as of the last commit

| Check | Result |
|---|---|
| `pnpm test` | 257 passing, 22 files |
| `pnpm typecheck` | clean |
| `pnpm build` | clean |
| `scripts/e2e-routes.sh` | 89/89, every route as every role |
| Browser | checkout, listing wizard and `/fees` driven by hand |

`pnpm lint` fails repo-wide on CRLF vs Biome's LF and is **not** a gate.

## What needs the owner, and cannot be faked

| Needs | For | Without it |
|---|---|---|
| `CRYPTOMUS_MERCHANT_ID` + `CRYPTOMUS_PAYMENT_KEY` | charging buyers, deposits | finance desk records payments by hand |
| `CRON_SECRET` | the sweep | abandoned deals hold listings; offers never expire; media is never purged; orphaned uploads are never collected |
| Google OAuth client id + secret | "Continue with Google" | password sign-in only |
| YouTube Data API key | channel autofetch and code verification | the seller types the figures, a moderator checks the channel |
| An email provider | password reset, verification, 2FA by email | `src/server/mailer.ts` throws; TOTP 2FA still works |
| Domain-ownership documents | Cryptomus merchant review | the account stays unverified |

Integrations are written against the published contracts and unit-tested, but
none has been exercised against a live third party, because no credentials
exist in this environment. In particular the Cryptomus signature is tested
against vectors derived from the documented algorithm, not against a signature
Cryptomus produced, and `verifyWebhookSign` round-trips the body through
`JSON.parse`/`JSON.stringify` — correct for the documented format, but it has
never met a real callback. Both are stated rather than hidden.

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
