import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { setUserBanned } from "@/server/admin-users";
import { createDeal } from "@/server/deals";
import { setPaused } from "@/server/seller-listings";
import { seedListing, seedUser, withCleanDb } from "@/test/db";

test(
  "a listing paused by a suspension cannot be resumed while its deal is still running",
  withCleanDb(async () => {
    // Suspending a seller pauses their reserved listings too, and a deal on
    // one keeps going. Lifting the suspension mid-deal let the seller press
    // Resume — PAUSED to LIVE — and a second buyer could then open a deal on
    // a channel the first buyer was already paying for.
    const seeded = await seedListing();
    const admin = await seedUser("SUPERADMIN");
    const deal = await createDeal({
      listingId: seeded.listing.id,
      buyerId: seeded.buyer.id,
      mode: "FASTEST",
    });
    if (!deal.ok) throw new Error(deal.reason);

    for (const banned of [true, false]) {
      const result = await setUserBanned({
        actorId: admin.id,
        actorRole: "SUPERADMIN",
        userId: seeded.seller.id,
        banned,
        reason: banned ? "Investigating a report about this seller." : null,
      });
      expect(result.ok).toBe(true);
    }

    expect(await setPaused(seeded.seller.id, seeded.listing.id, false)).toEqual(
      { ok: false, reason: "in-deal" },
    );
    const row = await db.listing.findUniqueOrThrow({
      where: { id: seeded.listing.id },
    });
    expect(row.status).toBe("PAUSED");
  }),
);

test(
  "a listing paused with no deal on it resumes as before",
  withCleanDb(async () => {
    const seeded = await seedListing();
    expect(await setPaused(seeded.seller.id, seeded.listing.id, true)).toEqual({
      ok: true,
    });
    expect(await setPaused(seeded.seller.id, seeded.listing.id, false)).toEqual(
      { ok: true },
    );
  }),
);
