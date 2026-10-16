import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { seedListing, withCleanDb } from "@/test/db";

test(
  "seeds a live listing at the spec's worked example price",
  withCleanDb(async () => {
    const { listing, seller, agent } = await seedListing();
    expect(listing.status).toBe("LIVE");
    expect(listing.priceUsd).toBe(10_000);
    expect(listing.sellerId).toBe(seller.id);
    expect(agent.role).toBe("AGENT");
  }),
);

test(
  "leaves a row behind for the next test to not find",
  withCleanDb(async () => {
    await seedListing();
    expect(await db.listing.count()).toBe(1);
  }),
);

test(
  "starts from an empty database",
  withCleanDb(async () => {
    expect(await db.listing.count()).toBe(0);
    expect(await db.user.count()).toBe(0);
  }),
);

test(
  "overrides the price and the listing status",
  withCleanDb(async () => {
    const { listing } = await seedListing({
      priceUsd: 600_000,
      listingStatus: "RESERVED",
    });
    expect(listing.priceUsd).toBe(600_000);
    expect(listing.status).toBe("RESERVED");
  }),
);

test(
  "seeds the settings singleton at the documented defaults",
  withCleanDb(async () => {
    const { settings } = await seedListing();
    expect(settings.buyerFeeBpSafest).toBe(300);
    expect(settings.buyerFeeBpFastest).toBe(300);
    expect(settings.sellerFeeBp).toBe(0);
    expect(settings.maxHoldsPerAgent).toBe(10);
    expect(settings.secondApprovalAboveUsd).toBe(500_000);
  }),
);
