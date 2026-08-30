# Channel Adda

An escrow-protected marketplace for buying and selling social media accounts —
YouTube, Instagram, Facebook, Telegram and websites.

Next.js 16 · React 19 · Prisma 7 · PostgreSQL · Better Auth · Tailwind 4

## Local development

Needs Node 22, pnpm and a PostgreSQL database.

```bash
pnpm install
cp .env.example .env        # fill in DATABASE_URL and BETTER_AUTH_SECRET
pnpm db:migrate
pnpm create:admin           # see below
pnpm dev
```

The database starts empty. Create an admin, then add listings through the app.

## Deploying

Ubuntu 24.04, nginx in front, PostgreSQL and the app on the same box.
Point your DNS at the server first — Let's Encrypt checks it.

```bash
# 1. Packages
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs nginx postgresql certbot python3-certbot-nginx
sudo corepack enable && sudo corepack prepare pnpm@10.6.5 --activate

# 2. Database. Keep / @ # : ? % out of the password — they break DATABASE_URL.
PW=$(openssl rand -base64 32 | tr -d '/+=@#:?%')
sudo -u postgres psql -c "CREATE ROLE channeladda LOGIN PASSWORD '$PW';"
sudo -u postgres createdb -O channeladda channeladda
echo "$PW"

# 3. App
cd /var/www/channeladda
cp .env.example .env && nano .env && chmod 600 .env
pnpm install --frozen-lockfile
pnpm db:migrate
NODE_ENV=production pnpm build

# 4. Your admin account
ADMIN_EMAIL='you@example.com' ADMIN_NAME='Your Name' \
ADMIN_PASSWORD='a-long-password' pnpm create:admin
```

In `.env`, `BETTER_AUTH_URL` and `NEXT_PUBLIC_SITE_URL` must both be
`https://yourdomain.com`.

### Run it

`/etc/systemd/system/channeladda.service`:

```ini
[Unit]
Description=Channel Adda
After=network-online.target postgresql.service

[Service]
WorkingDirectory=/var/www/channeladda
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=127.0.0.1
ExecStart=/usr/bin/pnpm start
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now channeladda
curl -s http://127.0.0.1:3000/api/health     # {"status":"ok",...}
```

### nginx + TLS

`/etc/nginx/sites-available/channeladda`:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    client_max_body_size 9M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
    }
}
```

```bash
sudo ln -sf /etc/nginx/sites-available/channeladda /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com --redirect
```

certbot rewrites that file for TLS, which is why it starts as plain HTTP.

### Updating

```bash
git pull && pnpm install --frozen-lockfile && pnpm db:migrate \
  && NODE_ENV=production pnpm build && sudo systemctl restart channeladda
```

## Notes

- Uploads are written to `.data/uploads` on local disk. Back them up; they are
  not in a database dump.
- Not wired up yet: email delivery (verification links go to the server log)
  and Cryptomus payments. "Buy" currently sends a full-price offer.
- Set your fees at `/admin/settings` after first sign-in — they start at
  defaults, not your numbers.
