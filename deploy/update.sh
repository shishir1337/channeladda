#!/usr/bin/env bash
#
# Deploy the current main branch. Run as the channeladda user:
#   /srv/channeladda/app/deploy/update.sh
#
# Builds before it stops anything, so a build that fails leaves the running
# site untouched.

set -euo pipefail

APP_DIR="/srv/channeladda/app"
cd "$APP_DIR"

echo "==> Fetching"
git fetch --prune origin
git reset --hard origin/main

echo "==> Installing"
pnpm install --frozen-lockfile

echo "==> Migrating"
# `migrate deploy` only applies existing migrations. It never generates one and
# never resets, which is what makes it the only migrate command safe to run
# unattended against live data.
pnpm exec prisma migrate deploy

echo "==> Building"
NODE_ENV=production pnpm build

echo "==> Restarting"
sudo systemctl restart channeladda

echo "==> Waiting for health"
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/api/health > /dev/null 2>&1; then
    echo "Healthy after ${i}s."
    curl -sS http://127.0.0.1:3000/api/health; echo
    exit 0
  fi
  sleep 1
done

echo "Did not come back healthy. Recent logs:" >&2
sudo journalctl -u channeladda -n 40 --no-pager >&2
exit 1
