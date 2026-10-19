import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { emptyFilters } from "@/lib/listing-query";
import { getPlatformFloors, queryListings } from "@/server/listings";
import { seedListing, withCleanDb } from "@/test/db";

test(
  "each platform starts from its cheapest live listing, not a sample figure",
  withCleanDb(async () => {
    await seedListing({ priceUsd: 10_000 });
    await seedListing({ priceUsd: 4_000 });
    // Cheaper, but not on sale: it does not set the floor.
    await seedListing({ priceUsd: 1_000, listingStatus: "REMOVED" });
    const telegram = await seedListing({ priceUsd: 2_500 });
    await db.listing.update({
      where: { id: telegram.listing.id },
      data: { platform: "TELEGRAM" },
    });

    expect(await getPlatformFloors()).toEqual({
      youtube: 40,
      instagram: null,
      facebook: null,
      telegram: 25,
      website: null,
    });
  }),
);

test(
  "the price filter's range is the spread under the other filters",
  withCleanDb(async () => {
    await seedListing({ priceUsd: 900_000 });
    const telegram = await seedListing({ priceUsd: 2_500 });
    await db.listing.update({
      where: { id: telegram.listing.id },
      data: { platform: "TELEGRAM" },
    });

    // On /browse/youtube the range is YouTube's, not the marketplace's.
    const youtube = await queryListings({
      ...emptyFilters,
      platforms: ["youtube"],
    });
    expect(youtube.priceBounds).toEqual({ min: 9_000, max: 9_000 });

    // The price filter itself does not narrow the range it describes.
    const priced = await queryListings({ ...emptyFilters, priceMax: 100 });
    expect(priced.priceBounds).toEqual({ min: 25, max: 9_000 });
  }),
);
