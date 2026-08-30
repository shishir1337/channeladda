# Deploying Channel Adda to Ubuntu 24.04

Target: a fresh VPS serving `https://channeladda.com`.

Stack: Node 22 + Next.js behind nginx, PostgreSQL 16 on the same box, TLS from
Let's Encrypt, process managed by systemd.

This is written for a **soft launch** — real accounts, real data, small
audience. Where something is deliberately deferred it says so.

---

## Before you start

You need:

- A VPS with a public IPv4 address, Ubuntu 24.04 LTS, at least 2 GB RAM
  (the Next.js build is the memory-hungry part, not the running app).
- `channeladda.com` DNS pointing at that address — both records:

  | Type | Name | Value |
  |------|------|-------|
  | A | `@` | your VPS IP |
  | A | `www` | your VPS IP |

  Do this first. Let's Encrypt validates over HTTP against the live DNS, so a
  certificate cannot be issued before the records have propagated.

Check propagation before going further:

```bash
dig +short channeladda.com
dig +short www.channeladda.com
```

---

## 1. Server basics

SSH in as root, then create a non-root user for yourself and a locked-down
system user for the app.

```bash
adduser deploy
usermod -aG sudo deploy

# The app user owns nothing but the app, and cannot log in.
adduser --system --group --home /srv/channeladda channeladda
```

Firewall — open SSH and the web, nothing else. Postgres and the Node process
stay on loopback.

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
ufw status
```

Unattended security updates:

```bash
apt update && apt upgrade -y
apt install -y unattended-upgrades
dpkg-reconfigure --priority=low unattended-upgrades
```

---

## 2. Node 22, pnpm, nginx, Postgres

```bash
# Node 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# pnpm — the repo pins pnpm@10.6.5 via packageManager
sudo corepack enable
sudo corepack prepare pnpm@10.6.5 --activate

sudo apt install -y nginx postgresql postgresql-contrib git curl

node -v && pnpm -v && psql --version
```

---

## 3. Database

```bash
sudo -u postgres psql
```

```sql
CREATE ROLE channeladda WITH LOGIN PASSWORD 'a-long-random-password';
CREATE DATABASE channeladda OWNER channeladda;
\c channeladda
GRANT ALL ON SCHEMA public TO channeladda;
\q
```

Generate that password rather than inventing one:

```bash
openssl rand -base64 32
```

Postgres listens on loopback only by default on Ubuntu. Leave it that way —
nothing outside the box needs to reach it.

---

## 4. The application

```bash
sudo mkdir -p /srv/channeladda
sudo chown channeladda:channeladda /srv/channeladda
sudo -u channeladda -H bash

cd /srv/channeladda
git clone https://github.com/YOUR_USER/channeladda.git app
cd app
```

Configuration:

```bash
cp .env.production.example .env
nano .env
chmod 600 .env
```

Fill in three things. Each has a specific way of going wrong:

- **`DATABASE_URL`** — the password from step 3.
- **`BETTER_AUTH_SECRET`** — generate it, do not invent it:

  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
  ```

  This signs every session cookie. Changing it later signs everyone out.

- **`BETTER_AUTH_URL`** — must be exactly `https://channeladda.com`. No
  trailing slash, and `https`, not `http`. Session cookies are `Secure` in
  production, so if this is wrong sign-in returns success and then silently
  fails, which is a genuinely confusing hour to debug.

Then install, migrate and build:

```bash
pnpm install --frozen-lockfile
pnpm exec prisma migrate deploy
NODE_ENV=production pnpm build
```

`prisma migrate deploy` only applies migrations that already exist. It never
generates one and never resets — the only migrate command safe against live
data.

> **Do not run `pnpm db:seed`.**
> The seed inserts 20 demo users, ~1,500 fake listings and a published
> development password shared by every one of them. It is for local work only.
> On a public site it is both a fraud and a security problem.

---

## 5. Create the first admin

The seed is the only other thing that makes a staff account, and you are not
running it. So:

```bash
cd /srv/channeladda/app
ADMIN_EMAIL='you@channeladda.com' \
ADMIN_NAME='Your Name' \
ADMIN_PASSWORD='a-long-password-you-generated' \
pnpm exec tsx --conditions=react-server scripts/create-admin.ts
```

Safe to re-run: an existing account is promoted rather than duplicated, and its
password is left alone.

Clear it from your shell history afterwards:

```bash
history -d $((HISTCMD-1))
```

---

## 6. Run it under systemd

Back as your sudo user:

```bash
sudo cp /srv/channeladda/app/deploy/channeladda.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now channeladda
sudo systemctl status channeladda
```

It should be listening on `127.0.0.1:3000` only:

```bash
curl -s http://127.0.0.1:3000/api/health
# {"status":"ok","time":"..."}
```

Logs:

```bash
sudo journalctl -u channeladda -f
```

The unit lets the app write to exactly two paths: `.next` and `.data`. `.data`
is where uploaded channel art and proof screenshots live, on local disk — see
*Known gaps* below.

---

## 7. nginx and TLS

Install the site config **before** running certbot; certbot fills in the TLS
directives in place.

```bash
sudo cp /srv/channeladda/app/deploy/nginx-channeladda.conf \
        /etc/nginx/sites-available/channeladda
sudo ln -sf /etc/nginx/sites-available/channeladda /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
```

That config references certificate files that do not exist yet, so `nginx -t`
will fail until certbot has run. Get the certificate:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d channeladda.com -d www.channeladda.com \
     --agree-tos -m you@channeladda.com --redirect
```

Then:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Renewal is installed automatically. Confirm it works before you forget about
it:

```bash
sudo certbot renew --dry-run
sudo systemctl list-timers | grep certbot
```

---

## 8. Check it

```bash
curl -I  https://channeladda.com
curl -s  https://channeladda.com/api/health
curl -I  http://channeladda.com          # expect 301
curl -I  https://www.channeladda.com     # expect 301
```

Then in a browser:

1. `https://channeladda.com` loads over TLS.
2. Sign in as the admin from step 5.
3. `/admin/settings` — **set the fees before anyone trades.** Buyer fee, seller
   fee and the escrow threshold are all admin-configurable and start at
   defaults, not at your intended numbers.
4. `/admin/users` — your account, as superadmin.
5. Register a second account and confirm it lands as a normal member.

---

## Deploying updates

```bash
sudo -u channeladda -H /srv/channeladda/app/deploy/update.sh
```

It fetches, installs, migrates, builds, restarts and then polls
`/api/health`, printing recent logs if the app does not come back. The build
runs before anything is stopped, so a failed build leaves the live site alone.

The `channeladda` user needs to restart the service without a password:

```bash
echo 'channeladda ALL=(root) NOPASSWD: /bin/systemctl restart channeladda' \
  | sudo tee /etc/sudoers.d/channeladda
sudo chmod 440 /etc/sudoers.d/channeladda
```

---

## Backups

Nothing below is optional once real money is involved.

```bash
sudo -u postgres mkdir -p /var/lib/postgresql/backups
sudo tee /etc/cron.daily/channeladda-backup >/dev/null <<'SH'
#!/bin/sh
set -e
DEST=/var/lib/postgresql/backups
su postgres -c "pg_dump -Fc channeladda" > "$DEST/channeladda-$(date +%F).dump"
find "$DEST" -name 'channeladda-*.dump' -mtime +14 -delete
SH
sudo chmod +x /etc/cron.daily/channeladda-backup
sudo /etc/cron.daily/channeladda-backup   # run once now
```

Uploaded files live in `/srv/channeladda/app/.data/uploads` and are **not** in
that dump. Back them up too, and copy both off the box — a backup on the same
disk as the database is not a backup.

---

## Known gaps at soft launch

These are real and deliberate. Know them before you take real customers.

| Gap | What it means today |
|-----|---------------------|
| **No email delivery** | Verification and password-reset links are written to the server log, not sent. `sudo journalctl -u channeladda \| grep -i verify`. Wire up a provider before public launch. |
| **No payments** | Cryptomus is not connected. "Buy" sends a full-price offer the seller confirms; no money moves through the platform yet. |
| **Uploads on local disk** | Files go to `.data/uploads` on this one server. Fine for one box; it is the thing to move to ImageKit before scaling out, and it must be in your backups. |
| **Escrow flow is not built** | Orders, ledger, withdrawals and disputes have schema but no state machine. |
| **Ban propagation is ~60s** | Sessions are read from a signed cookie for up to a minute before the database is consulted, so a suspension takes up to a minute to bite on an already-open session. Their listings are pulled immediately. |

---

## When something is wrong

```bash
sudo systemctl status channeladda
sudo journalctl -u channeladda -n 100 --no-pager
sudo tail -50 /var/log/nginx/channeladda.error.log
```

**502 from nginx** — the app is not running or not on 3000.
`curl http://127.0.0.1:3000/api/health` to see which.

**Sign-in appears to work but you stay logged out** — `BETTER_AUTH_URL` does
not match the browser's origin exactly. It must be `https://channeladda.com`.

**`/api/health` returns 503** — the app is up but Postgres is not reachable.
Check `systemctl status postgresql` and the password in `DATABASE_URL`.

**Build killed on a 2 GB box** — add swap:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```
