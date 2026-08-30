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

/**
 * Saves or unsaves, and reports which it ended up as.
 *
 * The unique constraint on (userId, listingId) is what makes this safe to
 * double-click: a second save cannot create a second row.
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
    await db.favourite.delete({ where: { id: existing.id } });
    return { ok: true, favourited: false };
  }

  await db.favourite.create({ data: { userId, listingId } });
  return { ok: true, favourited: true };
}
