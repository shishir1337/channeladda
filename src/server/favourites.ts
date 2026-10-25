import "server-only";

import { db } from "@/lib/db";

/**
 * Saved listings.
 *
 * Read through a small endpoint rather than baked into the page, deliberately:
 * browse, the homepage and the platform pages are static and cacheable, and
 * making them depend on who is looking would make every one of them render per
 * request to draw a heart.
 */

/** Every listing this person has saved. Ids only — the page has the rest. */
export async function getFavouriteIds(userId: string): Promise<string[]> {
  const rows = await db.favourite.findMany({
    where: { userId },
    select: { listingId: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return rows.map((row) => row.listingId);
}

export type ToggleResult =
  | { ok: true; favourited: boolean }
  | { ok: false; reason: "not-found" };

/** Two saves of the same listing at once: the unique index refused one. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}

/**
 * Saves or unsaves, and reports which it ended up as.
 *
 * The unique constraint on (userId, listingId) is what makes this safe to
 * double-click: a second save cannot create a second row. Each save is a
 * person watching the listing, so `watching` moves with it, in the same
 * transaction as the row — it sat at whatever the listing was created with
 * for ever. Never below zero: seeded figures were not made of rows.
 */
export async function toggleFavourite(
  userId: string,
  listingId: string,
): Promise<ToggleResult> {
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: { id: true },
  });
  if (!listing) return { ok: false, reason: "not-found" };

  const existing = await db.favourite.findUnique({
    where: { userId_listingId: { userId, listingId } },
    select: { id: true },
  });

  if (existing) {
    await db.$transaction(async (tx) => {
      const gone = await tx.favourite.deleteMany({
        where: { userId, listingId },
      });
      if (gone.count === 1) {
        await tx.listing.updateMany({
          where: { id: listingId, watching: { gt: 0 } },
          data: { watching: { decrement: 1 } },
        });
      }
    });
    return { ok: true, favourited: false };
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.favourite.create({ data: { userId, listingId } });
      await tx.listing.update({
        where: { id: listingId },
        data: { watching: { increment: 1 } },
      });
    });
  } catch (error) {
    // The other press saved it, and counted it.
    if (!isUniqueViolation(error)) throw error;
  }
  return { ok: true, favourited: true };
}
