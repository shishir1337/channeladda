import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { getFavouriteIds, toggleFavourite } from "@/server/favourites";
import { seedListing, seedUser, withCleanDb } from "@/test/db";

/**
 * Saving a listing, and the "watching" figure the seller and buyers see.
 * The column was there and nothing ever moved it: "0 watching" for ever.
 */

const watching = async (id: string) =>
  (await db.listing.findUniqueOrThrow({ where: { id } })).watching;

test(
  "saving counts as watching, and unsaving takes it back",
  withCleanDb(async () => {
    const { listing, buyer } = await seedListing();
    const other = await seedUser();
    const start = await watching(listing.id);

    expect(await toggleFavourite(buyer.id, listing.id)).toEqual({
      ok: true,
      favourited: true,
    });
    expect(await toggleFavourite(other.id, listing.id)).toMatchObject({
      favourited: true,
    });
    expect(await watching(listing.id)).toBe(start + 2);
    expect(await getFavouriteIds(buyer.id)).toEqual([listing.id]);

    expect(await toggleFavourite(buyer.id, listing.id)).toEqual({
      ok: true,
      favourited: false,
    });
    expect(await watching(listing.id)).toBe(start + 1);
  }),
);

test(
  "a double-pressed heart saves once and counts once",
  withCleanDb(async () => {
    const { listing, buyer } = await seedListing();
    const start = await watching(listing.id);
    const results = await Promise.all([
      toggleFavourite(buyer.id, listing.id),
      toggleFavourite(buyer.id, listing.id),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    const rows = await db.favourite.count({
      where: { userId: buyer.id, listingId: listing.id },
    });
    expect(await watching(listing.id)).toBe(start + rows);
  }),
);

test(
  "the figure never goes below nothing",
  withCleanDb(async () => {
    const { listing, buyer } = await seedListing();
    await toggleFavourite(buyer.id, listing.id);
    await db.listing.update({
      where: { id: listing.id },
      data: { watching: 0 },
    });
    await toggleFavourite(buyer.id, listing.id);
    expect(await watching(listing.id)).toBe(0);
  }),
);
