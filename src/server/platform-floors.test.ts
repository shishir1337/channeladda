import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { getPlatformFloors } from "@/server/listings";
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
