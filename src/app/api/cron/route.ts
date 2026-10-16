import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { purgeExpiredMedia, purgeOldMessages } from "@/server/chat-retention";
import { expireStaleDeals } from "@/server/deals";
import { expireOffers } from "@/server/offers";

/**
 * The scheduled sweep.
 *
 * There is no job runner in this project, so the things that have to happen on
 * a clock are collected behind one authenticated endpoint and called from
 * outside — a systemd timer, a crontab line, or any uptime pinger:
 *
 *   curl -fsS -X POST https://channeladda.com/api/cron \
 *     -H "authorization: Bearer $CRON_SECRET"
 *
 * Doing it this way rather than with an in-process timer is deliberate. The
 * app runs under pm2 in fork mode today, but the moment it runs twice an
 * in-process timer runs twice, and two sweeps racing over the same orders is
 * exactly the kind of bug that is invisible until it has refunded something
 * twice. One external caller, idempotent handlers, compare-and-set writes.
 */
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // No secret configured means the endpoint is closed, not open. An
  // unauthenticated sweep is a denial-of-service lever at best.
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const offered = header.replace(/^Bearer\s+/i, "");
  if (offered.length !== secret.length) return false;

  try {
    return timingSafeEqual(Buffer.from(offered), Buffer.from(secret));
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const results: Record<string, number | string> = {};

  // Each sweep is independent: one failing must not stop the others, because
  // a crontab only retries on the next tick.
  for (const [name, run] of [
    ["deals", expireStaleDeals],
    ["offers", expireOffers],
    // Media before messages: deleting a message first would take its
    // attachment row with it and orphan the file on disk for ever.
    ["media", purgeExpiredMedia],
    ["messages", purgeOldMessages],
  ] as const) {
    try {
      results[name] = await run();
    } catch (error) {
      console.error(`[cron] ${name}`, error);
      results[name] = error instanceof Error ? error.message : "failed";
    }
  }

  after(() => {
    console.log(`[cron] swept in ${Date.now() - started}ms`, results);
  });

  return Response.json({ ok: true, ...results });
}
