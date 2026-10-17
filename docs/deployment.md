# Deploying Channel Adda

Supersedes the runbook artifact published earlier in development, which
predates payments, the wallet, chat media and the scheduled sweep. This file
lives beside the code so it cannot drift from it again.

Target: one Ubuntu VPS, nginx in front, pm2 running the app, PostgreSQL local.
Project at `/var/www/channeladda`, running as root (the owner's choice).

---

## 1. What must exist before the first deploy

| Secret | Where it comes from | Without it |
| --- | --- | --- |
| `DATABASE_URL` | the Postgres role you create below | nothing runs |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` | sessions cannot be signed |
| `BETTER_AUTH_URL` | `https://channeladda.com` | every auth call fails `INVALID_ORIGIN` |
| `NEXT_PUBLIC_SITE_URL` | `https://channeladda.com` | OG images and callback URLs are wrong |
| `CRYPTOMUS_MERCHANT_ID` | Cryptomus dashboard → API keys | no checkout; finance records payments by hand |
| `CRYPTOMUS_PAYMENT_KEY` | same page | as above, and webhooks cannot be verified |
| `CRON_SECRET` | `openssl rand -base64 32` | **abandoned deals hold listings off the market for ever** |
| `GOOGLE_CLIENT_ID` / `_SECRET` | Google Cloud → Credentials → OAuth client | no "Continue with Google" button |
| `YOUTUBE_API_KEY` | Google Cloud → YouTube Data API v3 | sellers type their own figures; staff verify codes by eye |
| `SMTP_HOST` / `_PORT` / `_USER` / `_PASS` | any provider: Resend, Postmark, SES, Mailgun | **password reset silently does nothing** |
| `MAIL_FROM` | an address the provider has verified | mail is accepted and then dropped |

`BETTER_AUTH_URL` **must be https in production.** `src/lib/auth.ts` sets
`useSecureCookies` when `NODE_ENV` is production, so a browser drops the
session cookie on a plain-http origin and sign-in fails with no error anywhere.

Never put `NODE_ENV=production` in `.env` or the shell. `pnpm install` would
skip devDependencies and the build would fail on a missing `typescript`.
`next start` sets it for itself.

### Check them before you trust them

```bash
pnpm verify:integrations
```

Every third party is written against its published contract and unit-tested
against vectors derived from it; none of that proves the credentials in front
of you work. This raises a $1 Cryptomus invoice and reads it back — the call
every settlement is confirmed against, so a deal cannot be funded until it
works — resolves a YouTube channel, opens and authenticates an SMTP
connection, and checks the OAuth redirect URI and the cron secret.

It writes nothing to the database, and the invoice expires itself unpaid, so
it is safe to run against production. Run it after any credential change.

### Generating a database password

The password sits inside a URL, so these characters break parsing with a
confusing "invalid port number":

```bash
openssl rand -base64 32 | tr -d '/+=@#:?%'
```

---

## 2. Database

Root is not a Postgres role, so everything goes through `postgres`:

```bash
su - postgres -c "psql -c \"CREATE ROLE channeladda WITH LOGIN PASSWORD 'THE_PASSWORD'\""
su - postgres -c "createdb -O channeladda channeladda"
```

Then, as the app:

```bash
cd /var/www/channeladda
pnpm install --frozen-lockfile
pnpm exec prisma migrate deploy   # NOT `migrate dev` — it is interactive
pnpm build
```

`SHADOW_DATABASE_URL` and `DATABASE_URL_TEST` are development-only. Leave both
unset here: `migrate deploy` never reads them, and the test harness refuses to
run against a database whose name does not end in `_test` on a local host.

### The first superadmin

The seed script that made the demo accounts is not in this repository, so a
real deployment needs its own way in:

```bash
ADMIN_EMAIL=you@channeladda.com ADMIN_NAME="Your Name" \
ADMIN_PASSWORD='...' pnpm exec tsx --conditions=react-server scripts/create-admin.ts
```

Then sign in, open `/dashboard/security`, and turn on two-step. That account
can change fees and appoint staff.

### Roles to create

Through `/admin/users`. Each is a different desk and the boundaries are
enforced per page, not just in the navigation:

- `AGENT` — takes custody of channels. Sees `/admin/deals` and nothing else.
- `MODERATOR` — listings, reports, conversations. No money.
- `FINANCE` — payouts and recording payments. No fees.
- `SUPERADMIN` — fees, roles, bans.

Give every one of them two-step. Between them they can move other people's
money and take ownership of other people's channels.

---

## 3. pm2

Fork mode, one instance. This is not a preference:

- `src/lib/auth.ts` rate-limits with `storage: "memory"`, so a second instance
  doubles every limit.
- Next's ISR cache is per-instance on disk.
- The settings cache in `src/server/settings.ts` lives on `globalThis`, so a
  fee change takes up to ten seconds to reach a second instance.

```bash
pm2 start /var/www/channeladda/node_modules/next/dist/bin/next \
  --name channeladda --cwd /var/www/channeladda --interpreter node \
  --max-memory-restart 800M -- start -H 127.0.0.1 -p 3000
pm2 save && pm2 startup systemd
```

---

## 4. nginx

```nginx
server {
  listen 443 ssl http2;
  server_name channeladda.com;

  # 30M, not 10M. Chat accepts 25MB clips (MAX_VIDEO_BYTES in
  # src/server/storage.ts) and multipart framing adds to that. At 10M a
  # seller's screen recording is rejected by nginx before the app ever sees
  # it, with a 413 that explains nothing.
  client_max_body_size 30M;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    # Server Actions compare Origin against Host. Without this they all fail.
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }

  # Cryptomus posts callbacks from one address. The route verifies the
  # signature regardless, so this is defence in depth and not the control.
  location /api/webhooks/cryptomus {
    allow 91.227.144.54;
    deny all;
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

HSTS belongs here, with whatever terminates TLS — not in `next.config.ts`,
which deliberately omits it so a developer cannot make localhost unreachable
in their own browser for two years.

---

## 5. The scheduled sweep

**Not optional.** `POST /api/cron` expires abandoned deals, lapses old offers,
deletes chat attachments past 48 hours and clears messages past 10 days.
Without it a buyer can open a deal on any listing, walk away, and that listing
is reserved for ever — for free, on every listing.

```bash
# /etc/cron.d/channeladda
*/10 * * * * root curl -fsS -m 30 -X POST https://channeladda.com/api/cron \
  -H "authorization: Bearer THE_CRON_SECRET" >/dev/null 2>&1
```

A bearer-guarded endpoint rather than an in-process timer, because the moment
the app runs twice an in-process timer sweeps twice. Every handler is
idempotent and every write is a compare-and-set, so an overlapping run is safe.

Check it works:

```bash
curl -fsS -X POST https://channeladda.com/api/cron \
  -H "authorization: Bearer $CRON_SECRET"
# {"ok":true,"deals":0,"offers":0,"media":0,"messages":0}
```

With no `CRON_SECRET` set the endpoint is **closed**, not open. It answers 401.

---

## 6. Cryptomus

1. Register the callback URL: `https://channeladda.com/api/webhooks/cryptomus`
2. The payment key signs outgoing requests **and** verifies incoming
   callbacks. It is the single secret that decides whether a deal can be
   funded.
3. The route checks the signature before reading anything, then **confirms a
   settled status against Cryptomus's own API** rather than believing the
   callback. A forged body that somehow passed signing still has to agree with
   the invoice lookup.

Verify end to end on a real £1 invoice before opening the doors. A payment
that never reaches `recordOpeningPayment` leaves a deal stuck at
`AWAITING_PAYMENT`, which finance can clear by hand from `/admin/deals`.

---

## 7. Google OAuth

Authorised redirect URI, exactly:

```
https://channeladda.com/api/auth/callback/google
```

Only `openid`, `email` and `profile` are requested. If the consent screen ever
asks for YouTube scopes, something is wrong — a marketplace has no business
holding a token that can read a seller's channel.

---

## 8. Backups

Two things, and the database alone is not enough:

```bash
# The database
su - postgres -c "pg_dump -Fc channeladda" > /root/backups/db-$(date +%F).dump

# Uploaded files: listing artwork, proof screenshots, chat attachments
tar -czf /root/backups/uploads-$(date +%F).tar.gz \
  -C /var/www/channeladda .data/uploads
```

Chat attachments are deleted after 48 hours by design, so a backup older than
that will not contain them. That is intended.

---

## 9. Deploying a change

```bash
cd /var/www/channeladda
git pull
pnpm install --frozen-lockfile
pnpm exec prisma migrate deploy
pnpm build                    # pm2 restart alone does NOT pick up source changes
pm2 restart channeladda
```

`pnpm build` is the gate: `next.config.ts` sets
`typescript: { ignoreBuildErrors: false }`, so a type error fails the deploy
rather than shipping.

---

## 10. Email

`src/server/mailer.ts` speaks SMTP, which every provider accepts — Resend,
Postmark, SES, Mailgun, Fastmail, your own Postfix. Set `SMTP_HOST`,
`SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM`, then run
`pnpm verify:integrations`, which opens a connection and authenticates
without sending anything.

Port 465 is TLS from the first byte and 587 starts plain and upgrades; the
code derives the mode from the port, so it cannot be set backwards. Getting
that wrong by hand produces a hang rather than an error.

`MAIL_FROM` has to be an address the provider has verified. An unverified
one is usually accepted at send time and dropped afterwards, which looks
exactly like working.

**With `SMTP_HOST` unset, `sendMail` throws in production.** Better Auth
catches it, so sign-up and sign-in still work and nothing returns a 500 — but
password reset silently does nothing and logs "Failed to run background
task". Two-step verification is unaffected either way, because it uses an
authenticator app; but without email, somebody who loses both their password
and their backup codes needs a manual database change to get back in.

---

## 11. Health

```bash
curl -fsS https://channeladda.com/api/health
# {"status":"ok"} — or 503 {"status":"degraded"} if Postgres is unreachable
```

Worth a monitor. It queries the database, so it fails when the thing that
matters fails rather than merely proving the process is alive.
