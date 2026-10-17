import { createHash, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { purgeExpiredMedia, purgeOldMessages } from "@/server/chat-retention";
import { expireStaleDeals } from "@/server/deals";
import { reconcileInvoices } from "@/server/invoices";
import { expireOffers, releaseLapsedOfferReservations } from "@/server/offers";
import { recordSweep } from "@/server/settings";
import { collectOrphanUploads } from "@/server/upload-access";

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

  // Hashed first, so the comparison is over two fixed-length digests.
  // Returning early on a length mismatch leaked the secret's length — not
  // much for a 32-byte random value, but this costs nothing and removes the
  // caveat entirely.
  const digest = (value: string) => createHash("sha256").update(value).digest();

  return timingSafeEqual(digest(offered), digest(secret));
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
    // Reconciliation first, and before expiry: an invoice that was paid but
    // whose callback was lost has to be applied before the sweep decides the
    // deal was abandoned and expires it.
    ["reconciled", reconcileInvoices],
    ["deals", expireStaleDeals],
    ["offers", expireOffers],
    // An accepted offer nobody turned into a deal. Before this, accepting
    // one took the listing off the market for good.
    ["acceptances", () => releaseLapsedOfferReservations()],
    // Media before messages: deleting a message first would take its
    // attachment row with it and orphan the file on disk for ever.
    ["media", purgeExpiredMedia],
    ["messages", purgeOldMessages],
    // Last: a file nobody ever attached to anything. The upload endpoint is
    // open to any signed-in account, so without this it is free storage.
    ["orphans", collectOrphanUploads],
  ] as const) {
    try {
      results[name] = await run();
    } catch (error) {
      console.error(`[cron] ${name}`, error);
      results[name] = error instanceof Error ? error.message : "failed";
    }
  }

  // Written every run, so the staff overview can say when the sweep last
  // ran. A dead crontab used to be silent until listings stayed reserved.
  try {
    await recordSweep({ ...results, ms: Date.now() - started });
  } catch (error) {
    console.error("[cron] could not record the sweep", error);
  }

  after(() => {
    console.log(`[cron] swept in ${Date.now() - started}ms`, results);
  });

  return Response.json({ ok: true, ...results });
}
