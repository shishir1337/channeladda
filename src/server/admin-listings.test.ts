import { expect, test } from "vitest";
import type { ListingStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import {
  getListingForReview,
  getQueueCounts,
  getReviewQueue,
  removeListing,
  reopenListing,
  setListingFeatured,
} from "@/server/admin-listings";
import { seedListing, seedUser, withCleanDb } from "@/test/db";

const TAKEDOWN = "Reported as a copy of another seller's channel.";
const BACK = "The report was about a different channel with a similar name.";

async function removedListing() {
  const seeded = await seedListing();
  const moderator = await seedUser("MODERATOR");
  const removed = await removeListing(seeded.listing.id, TAKEDOWN);
  if (!removed.ok) throw new Error(removed.reason);
  return { ...seeded, moderator };
}

// ------------------------------------------------- taken down in error

test(
  "a removed listing goes back to review, on the record, and the seller is told",
  withCleanDb(async () => {
    const { listing, seller, moderator } = await removedListing();

    expect(await reopenListing(listing.id, moderator.id, BACK)).toEqual({
      ok: true,
      before: "REMOVED",
      after: "ADMIN_REVIEW",
    });

    const row = await db.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(row.status).toBe("ADMIN_REVIEW");
    expect(row.rejectionReason).toBeNull();

    // In the queue a moderator works, not on the marketplace.
    const queue = await getReviewQueue("ADMIN_REVIEW");
    expect(queue.map((q) => q.id)).toEqual([listing.id]);

    // The takedown's reason survives in the trail, beside the new one.
    const trail = await db.auditLog.findMany({
      where: { entity: "listing", entityId: listing.id },
    });
    expect(trail).toHaveLength(1);
    expect(trail[0]).toMatchObject({
      actorId: moderator.id,
      action: "listing.reopen",
      before: { status: "REMOVED", reason: TAKEDOWN },
      after: { status: "ADMIN_REVIEW", reason: BACK },
    });

    const told = await db.notification.findMany({
      where: { userId: seller.id },
    });
    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({
      kind: "LISTING",
      body: BACK,
      href: `/dashboard/listings/${listing.id}`,
    });
  }),
);

test(
  "reopening needs a reason the seller can read",
  withCleanDb(async () => {
    const { listing, seller, moderator } = await removedListing();

    expect(await reopenListing(listing.id, moderator.id, "  oops  ")).toEqual({
      ok: false,
      reason: "reason-too-short",
    });

    const row = await db.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(row.status).toBe("REMOVED");
    expect(await db.auditLog.count()).toBe(0);
    expect(await db.notification.count({ where: { userId: seller.id } })).toBe(
      0,
    );
  }),
);

test(
  "only a taken-down listing can be sent back to review",
  withCleanDb(async () => {
    const { listing } = await seedListing();
    const moderator = await seedUser("MODERATOR");

    for (const status of [
      "LIVE",
      "REJECTED",
      "PAUSED",
      "SOLD",
    ] as ListingStatus[]) {
      await db.listing.update({ where: { id: listing.id }, data: { status } });
      expect(await reopenListing(listing.id, moderator.id, BACK)).toEqual({
        ok: false,
        reason: "wrong-status",
      });
    }
    expect(await reopenListing("no-such-listing", moderator.id, BACK)).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(await db.auditLog.count()).toBe(0);
  }),
);

test(
  "a suspended seller's listing stays down",
  withCleanDb(async () => {
    const { listing, seller, moderator } = await removedListing();
    await db.user.update({
      where: { id: seller.id },
      data: { bannedAt: new Date(), banReason: "Chargebacks" },
    });

    expect(await reopenListing(listing.id, moderator.id, BACK)).toEqual({
      ok: false,
      reason: "seller-suspended",
    });
    const row = await db.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(row.status).toBe("REMOVED");
  }),
);

// ------------------------------------------------------------ featured

test(
  "a live listing can be featured and unfeatured, each on the record",
  withCleanDb(async () => {
    const { listing } = await seedListing();
    const moderator = await seedUser("MODERATOR");

    expect(await setListingFeatured(listing.id, moderator.id, true)).toEqual({
      ok: true,
      changed: true,
      featured: true,
    });
    expect((await getListingForReview(listing.id))?.featured).toBe(true);
    expect((await getReviewQueue("LIVE"))[0].featured).toBe(true);

    // A double click changes nothing and writes nothing.
    expect(await setListingFeatured(listing.id, moderator.id, true)).toEqual({
      ok: true,
      changed: false,
      featured: true,
    });

    expect(await setListingFeatured(listing.id, moderator.id, false)).toEqual({
      ok: true,
      changed: true,
      featured: false,
    });

    const trail = await db.auditLog.findMany({
      where: { entity: "listing", entityId: listing.id },
      orderBy: { createdAt: "asc" },
    });
    expect(trail.map((r) => [r.action, r.actorId, r.after])).toEqual([
      ["listing.feature", moderator.id, { featured: true }],
      ["listing.unfeature", moderator.id, { featured: false }],
    ]);
  }),
);

test(
  "featured only changes on a live listing",
  withCleanDb(async () => {
    const { listing } = await seedListing();
    const moderator = await seedUser("MODERATOR");

    for (const status of [
      "ADMIN_REVIEW",
      "RESERVED",
      "PAUSED",
      "SOLD",
      "REMOVED",
    ] as ListingStatus[]) {
      await db.listing.update({
        where: { id: listing.id },
        data: { status, featured: false },
      });
      expect(await setListingFeatured(listing.id, moderator.id, true)).toEqual({
        ok: false,
        reason: "wrong-status",
      });

      // Nor off: the showcase only reads live listings, so it changes nothing
      // anybody sees, and the rule is easier to hold with no exceptions.
      await db.listing.update({
        where: { id: listing.id },
        data: { featured: true },
      });
      expect(await setListingFeatured(listing.id, moderator.id, false)).toEqual(
        { ok: false, reason: "wrong-status" },
      );
      const row = await db.listing.findUniqueOrThrow({
        where: { id: listing.id },
      });
      expect(row.featured).toBe(true);
    }

    expect(await db.auditLog.count()).toBe(0);
  }),
);

// ------------------------------------------------------------ the queue

test(
  "every status staff can act on has a count and a list",
  withCleanDb(async () => {
    const statuses: ListingStatus[] = [
      "ADMIN_REVIEW",
      "CODE_CHECK",
      "LIVE",
      "REJECTED",
      "RESERVED",
      "PAUSED",
      "SOLD",
      "REMOVED",
      "REMOVED",
    ];
    const ids: Record<string, string[]> = {};
    for (const status of statuses) {
      const { listing } = await seedListing();
      await db.listing.update({ where: { id: listing.id }, data: { status } });
      ids[status] = [...(ids[status] ?? []), listing.id];
    }

    expect(await getQueueCounts()).toEqual({
      awaitingReview: 1,
      awaitingCode: 1,
      live: 1,
      rejected: 1,
      reserved: 1,
      paused: 1,
      sold: 1,
      removed: 2,
    });

    for (const status of ["PAUSED", "SOLD", "RESERVED"] as ListingStatus[]) {
      expect((await getReviewQueue(status)).map((q) => q.id)).toEqual(
        ids[status],
      );
    }

    // Taken down reads newest first: the one somebody is looking for is
    // usually the one that came down most recently.
    const [older, newer] = ids.REMOVED;
    await db.listing.update({
      where: { id: older },
      data: { updatedAt: new Date(Date.now() - 60 * 60 * 1000) },
    });
    expect((await getReviewQueue("REMOVED")).map((q) => q.id)).toEqual([
      newer,
      older,
    ]);
  }),
);

test(
  "the staff read carries the seller's WhatsApp",
  withCleanDb(async () => {
    const { listing } = await seedListing();
    await db.listing.update({
      where: { id: listing.id },
      data: { whatsapp: "+8801712345678" },
    });

    expect((await getListingForReview(listing.id))?.whatsapp).toBe(
      "+8801712345678",
    );
  }),
);
