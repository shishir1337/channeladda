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
the channel price; nothing advances before the opening payment clears.

## Done

- [x] **Phase 1 — Agent custody and the two deal modes.** Transition table,
      step templates, fee arithmetic, schema + migration, test harness,
      creation/payment/advancement/resolution, agent cap and second approval,
      audit trail, admin feed, actions, buyer and admin UI.
- [x] **First fix pass.** 6 Critical and 9 Important closed. Worst:
      `advanceStep` skipped the state machine on steps with no status change,
      so a buyer could mark their own payment done and put a seller's channel
      into custody having paid nothing.
- [x] **Phase 2 — Cryptomus and the clock.** Pure signing module (PHP-style
      slash escaping), API client, confirmed webhook, `POST /api/cron` sweep.
- [x] **Phase 3 — Wallet.** Cryptomus deposits idempotent on
      `LedgerEntry.externalRef`, a balance page, paying a deal from balance,
      seller withdrawals against `PayoutAddress`, the finance queue, and an
      admin-set withdrawal minimum.
- [x] **Phase 4 — Per-mode copy.** The escrow promise was true for Fastest and
      false for Safest. Rewritten across the marketing pages, the legal pages,
      the FAQ, the auth shell and the listing page.
- [x] **Phase 5 — Auth.** Google OAuth and the `two-factor` plugin, both behind
      env vars: with no Google credentials the button is not rendered and
      password sign-in is unaffected. TOTP 2FA works without an email provider.
- [x] **Phase 6 — Chat.** Two-pane layout, an automatic opening message, media
      to 25MB, 48h media expiry, 10d message retention with carve-outs for
      deals, disputes and flagged threads.
- [x] **Phase 7 — YouTube listing wizard.** Channel-link autofetch, a
      `description` field, yearly revenue, staff-only WhatsApp, and an
      ownership code the seller places in their channel description. The
      fetcher degrades to typed figures without a YouTube API key.
- [x] **Second fix pass.** 7 Critical closed. Worst: client-supplied
      `attachmentUrl` allowed external URL injection and, through the retention
      sweep, deletion of arbitrary files; a wallet-funded refund destroyed the
      buyer's money; and the Cryptomus webhook answered 200 before doing the
      work, so a failure discarded the retry and the deal then expired.
- [x] **Upload ownership.** `Upload` records who uploaded each file, so the
      access gate can admit the uploader before anything references the file,
      and so an upload nobody ever attaches is collected rather than kept.

## Verification, as of the last commit

| Check | Result |
|---|---|
| `pnpm test` | 232 passing, 19 files |
| `pnpm typecheck` | clean |
| `pnpm build` | clean |
| `scripts/e2e-routes.sh` | 89/89, every route as every role |

`pnpm lint` fails repo-wide on CRLF vs Biome's LF and is **not** a gate.

## What needs the owner, and cannot be faked

| Needs | For | Without it |
|---|---|---|
| `CRYPTOMUS_MERCHANT_ID` + `CRYPTOMUS_PAYMENT_KEY` | charging buyers, deposits | finance desk records payments by hand |
| `CRON_SECRET` | the sweep | abandoned deals hold listings; offers never expire; media is never purged |
| Google OAuth client id + secret | "Continue with Google" | password sign-in only |
| YouTube Data API key | channel autofetch and code verification | the seller types the figures |
| An email provider | password reset, verification, 2FA by email | `src/server/mailer.ts` throws; TOTP 2FA still works |
| Domain-ownership documents | Cryptomus merchant review | the account stays unverified |

Integrations are written against the published contracts and unit-tested, but
none has been exercised against a live third party, because no credentials
exist in this environment. In particular the Cryptomus signature is tested
against vectors derived from the documented algorithm, not against a signature
Cryptomus produced. That is stated rather than hidden.

## Standing rules for this run

- Every change lands with tests, `pnpm typecheck` and `pnpm build` green.
- Run `pnpm exec next typegen` after adding a route, or `PageProps` fails.
- Never commit a credential. Never push, merge or deploy.
- Heredocs over ~150 lines get truncated by the harness: write edit scripts to
  the scratchpad and run them by path.
- A new column needs the migration applied to both `DATABASE_URL` and
  `DATABASE_URL_TEST`, and adding to `TABLES` in `src/test/db.ts`.
