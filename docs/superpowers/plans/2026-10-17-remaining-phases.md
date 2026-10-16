# Channel Adda — build-out tracker

Running state of the autonomous build. Branch `feat/agent-custody`.
Spec for phase 1: `docs/superpowers/specs/2026-10-17-agent-custody-design.md`.

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
- [x] **Fix pass** after an adversarial whole-branch review: 6 Critical and 9
      Important defects closed. Worst was `advanceStep` skipping the state
      machine on steps with no status change, which let a buyer mark their own
      payment done and put a seller's channel into custody having paid nothing.
- [x] **Phase 2 — Cryptomus and the clock.** Pure signing module (PHP-style
      slash escaping), API client, confirmed webhook, `POST /api/cron` sweep
      expiring abandoned deals and lapsed offers.

## To do, in order

- [ ] **Phase 3 — Wallet.** Deposits via Cryptomus, a balance page, paying a
      deal from balance, seller withdrawals against `PayoutAddress`, and the
      finance queue. Models `LedgerEntry`, `Withdrawal`, `PayoutAddress`
      already exist and are unused.
- [ ] **Phase 4 — Per-mode copy.** ~25 files promise escrow-held payments and
      full refunds. True for Fastest, false for Safest. `src/data/legal.ts`,
      `auth-shell.tsx`, `how-it-works`, `trust-safety`, `help.ts`, `site.ts`.
      Gates the Cryptomus merchant review.
- [ ] **Phase 5 — Auth.** Google OAuth + the `two-factor` plugin (present in
      Better Auth 1.7.1; needs a `twoFactor` table and
      `user.twoFactorEnabled`). **Blocked on credentials:** Google client id
      and secret. Build it behind env vars; it degrades to password-only.
- [ ] **Phase 6 — Chat.** Messenger two-pane layout, an automatic first
      message, media to 25MB, 48h media expiry, 10d message retention with
      carve-outs for deals, disputes and flagged threads.
- [ ] **Phase 7 — YouTube listing wizard.** Channel link autofetch (name,
      avatar, subscribers), a `description` field the schema lacks, yearly
      revenue, WhatsApp (staff-only), and the ownership code check.
      **Blocked on credentials:** a YouTube Data API key.

## What needs the owner, and cannot be faked

| Needs | For | Without it |
|---|---|---|
| `CRYPTOMUS_MERCHANT_ID` + `CRYPTOMUS_PAYMENT_KEY` | charging buyers, deposits | finance desk records payments by hand |
| `CRON_SECRET` | the sweep | abandoned deals hold listings; offers never expire |
| Google OAuth client id + secret | "Continue with Google" | password sign-in only |
| YouTube Data API key | channel autofetch and code verification | the seller types the figures |
| An email provider | password reset, verification, 2FA by email | `src/server/mailer.ts` throws; TOTP 2FA still works |
| Domain-ownership documents | Cryptomus merchant review | the account stays unverified |

Integrations are written against the published contracts and unit-tested, but
none of them has been exercised against a live third party, because no
credentials exist in this environment. That is stated rather than hidden.

## Standing rules for this run

- Every change lands with tests, `pnpm typecheck` and `pnpm build` green.
- `pnpm lint` fails repo-wide on CRLF vs Biome's LF and is **not** a gate;
  format new files through the scratchpad biome-fix script instead.
- Run `pnpm exec next typegen` after adding a route, or `PageProps` fails.
- Never commit a credential. Never push, merge or deploy.
- Heredocs over ~150 lines get truncated by the harness: write edit scripts to
  the scratchpad and run them by path.
