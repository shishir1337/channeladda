#!/usr/bin/env bash
# Every route, as every role, against a production build.
#
# Unit tests cover the server logic; this catches what they cannot: a page that
# renders a 500 because of how it reads its data, a guard that is missing, a
# route that was never wired. Each expectation is written down, so a change in
# access control shows up as a diff rather than as a surprise.
set -u

BASE="${1:?usage: e2e-routes.sh BASE_URL JAR_DIR}"
JARS="${2:?}"
# Better Auth rejects a sign-in whose Origin is not its own baseURL with a
# 403 and no session, which reads downstream as every authenticated route
# redirecting to /signin. Run the server with BETTER_AUTH_URL set to the
# URL you sweep, or pass that URL here as the third argument.
ORIGIN="${3:-$BASE}"

# The seeded accounts' shared password. Not written down here: the file that
# creates those accounts is git-ignored for exactly this reason, and a
# password in a committed script is a password in the repository whatever it
# happens to unlock today.
PASSWORD="${E2E_PASSWORD:-}"
if [ -z "$PASSWORD" ]; then
  echo "Set E2E_PASSWORD to the seeded accounts’ password. It is the one"
  echo "scripts/dev-credentials.ts sets:"
  echo "  E2E_PASSWORD=... bash scripts/e2e-routes.sh BASE_URL JAR_DIR"
  exit 2
fi
PASS=0
FAIL=0

login() {
  local email="$1" jar="$2"
  curl -s -c "$JARS/$jar.jar" -X POST "$BASE/api/auth/sign-in/email" \
    -H 'Content-Type: application/json' -H "Origin: $ORIGIN" \
    -d "{\"email\":\"$email\",\"password\":\"$PASSWORD\"}" \
    -o /dev/null -w '%{http_code}'
}

check() {
  local jar="$1" path="$2" want="$3"
  local got
  if [ "$jar" = "-" ]; then
    got=$(curl -s -o /dev/null -w '%{http_code}' "$BASE$path")
  else
    got=$(curl -s -b "$JARS/$jar.jar" -o /dev/null -w '%{http_code}' "$BASE$path")
  fi
  if [ "$got" = "$want" ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    printf 'FAIL  %-10s %-34s want %s got %s\n' "$jar" "$path" "$want" "$got"
  fi
}

echo "--- signing in ---"
for pair in "admin@dealbaron.com:admin" "moderator@dealbaron.com:mod" \
            "finance@dealbaron.com:fin" "agent@dealbaron.com:agent" \
            "hannah-wells@example.com:seller" "daniel-osei@example.com:buyer"; do
  email="${pair%%:*}"; jar="${pair##*:}"
  code=$(login "$email" "$jar")
  printf '%-8s %s\n' "$jar" "$code"
  # Stop here rather than report fifty redirects that all have one cause.
  if [ "$code" != "200" ]; then
    echo "could not sign in as $email (HTTP $code). Every later check would"
    echo "fail for that one reason, so this stops now. Check that the server"
    echo "on $BASE is this project and its BETTER_AUTH_URL is $ORIGIN."
    exit 1
  fi
  # Better Auth allows 3 sign-ins per 10s per IP. Four seconds is not enough
  # once there are six accounts: the fourth lands inside the window of the
  # first three and comes back 429, leaving that role with no session and
  # every later check reading as a redirect.
  sleep 11
done

echo "--- public pages (anonymous) ---"
for p in / /browse /sell /fees /how-it-works /trust-safety /about /support \
         /terms /privacy /refunds /aml-kyc /listing-rules /sellers /sold \
         /services /help /affiliates /signin /signup /signin/two-factor \
         /forgot-password; do
  check - "$p" 200
done
check - /api/health 200

echo "--- dashboard needs a session ---"
for p in /dashboard /dashboard/deals /dashboard/wallet /dashboard/security \
         /dashboard/messages /dashboard/offers /dashboard/listings \
         /dashboard/notifications; do
  check - "$p" 307
  check buyer "$p" 200
done
check seller /dashboard/listings/new 200

echo "--- the admin area is closed to members ---"
for p in /admin /admin/deals /admin/payouts /admin/listings /admin/users \
         /admin/settings /admin/support /admin/messages; do
  check buyer "$p" 404
done

echo "--- an agent sees deals and nothing else ---"
check agent /admin/deals 200
check agent "/admin/deals?agent=me" 200
for p in /admin /admin/listings /admin/users /admin/settings /admin/payouts \
         /admin/support /admin/messages; do
  check agent "$p" 404
done

echo "--- negative assertions: the desks do not overlap ---"
# The point of writing these down. A guard that quietly disappears has to
# show up here as a diff, and only a 404 expectation can do that.
check mod /admin/payouts 404
check mod /admin/settings 404
check fin /admin/settings 404
check agent /admin/users 404
check agent /admin/payouts 404
check seller /admin/deals 404
check buyer /admin/deals 404
check buyer /admin/payouts 404
check buyer /admin/users 404

echo "--- uploads: only generated keys are served ---"
# C1 lived here: the serving route refused the `message/` prefix the chat
# uploader produces, so every attachment 404'd with a green test suite. These
# are shapes, not real files, so 404 is the right answer for all of them —
# what matters is that nothing interesting reaches the filesystem.
for p in "/uploads/../../etc/passwd" "/uploads/secrets/x.png"          "/uploads/message/short.png" "/uploads/cover/$(printf 'a%.0s' $(seq 32)).mp4"; do
  check - "$p" 404
done

echo "--- a moderator: everything but money and fees ---"
for p in /admin /admin/deals /admin/listings /admin/users /admin/support \
         /admin/messages; do
  check mod "$p" 200
done
check mod /admin/settings 404
check mod /admin/payouts 404

echo "--- finance: payouts, not fees ---"
check fin /admin/payouts 200
check fin /admin/deals 200
check fin /admin/settings 404

echo "--- superadmin: all of it ---"
for p in /admin /admin/deals /admin/payouts /admin/listings /admin/users \
         /admin/settings /admin/support; do
  check admin "$p" 200
done

echo "--- webhooks and the sweep refuse the unauthenticated ---"
check - /api/webhooks/cryptomus 405
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/cron")
[ "$code" = "401" ] && PASS=$((PASS + 1)) || {
  FAIL=$((FAIL + 1)); echo "FAIL  cron POST without a secret want 401 got $code"; }
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  "$BASE/api/webhooks/cryptomus" -H 'Content-Type: application/json' \
  -d '{"order_id":"CA-1","status":"paid","sign":"00000000000000000000000000000000"}')
# 503 when unconfigured, 401 when configured and the signature is wrong. Both
# are refusals; neither must be a 200.
case "$code" in
  401|503) PASS=$((PASS + 1)) ;;
  *) FAIL=$((FAIL + 1)); echo "FAIL  forged webhook want 401/503 got $code" ;;
esac

echo
echo "passed $PASS, failed $FAIL"
[ "$FAIL" -eq 0 ]
