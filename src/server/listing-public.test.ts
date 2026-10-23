import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { getListing } from "@/server/listings";
import { seedListing, withCleanDb } from "@/test/db";

// What a buyer sees on a listing before they talk to anyone. The owner, on
// the live page: "I still cannot see the actual YouTube link that was
// listed", and "(0 reviews)" where the rating points should be.

test(
  "the listing page carries the channel's real link, and only a real one",
  withCleanDb(async () => {
    const { listing } = await seedListing();
    const at = (sourceUrl: string | null) =>
      db.listing.update({ where: { id: listing.id }, data: { sourceUrl } });

    await at("https://www.youtube.com/@faceless-finance");
    expect((await getListing(listing.slug))?.channel).toEqual({
      href: "https://www.youtube.com/@faceless-finance",
      label: "Open on YouTube",
    });

    // A seller-typed URL on another host would send a buyer to a lookalike.
    await at("https://youtube.com.example.test/@faceless-finance");
    expect((await getListing(listing.slug))?.channel).toBeNull();

    await at(null);
    expect((await getListing(listing.slug))?.channel).toBeNull();
  }),
);

test(
  "the seller is rated in points from their completed deals, tripled while they hold the badge",
  withCleanDb(async () => {
    const { listing, seller, buyer } = await seedListing();
    await db.order.create({
      data: {
        reference: `CA-${randomUUID().slice(0, 8)}`,
        listingId: listing.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        mode: "SAFEST",
        status: "COMPLETED",
        // A $500 deal: 250 points.
        priceUsd: 50_000,
        buyerFeeUsd: 0,
        sellerFeeUsd: 0,
        totalUsd: 50_000,
      },
    });

    expect((await getListing(listing.slug))?.sellerPoints).toBe(250);

    const now = Date.now();
    await db.resellerPass.create({
      data: {
        userId: seller.id,
        startsAt: new Date(now - 86_400_000),
        endsAt: new Date(now + 29 * 86_400_000),
        amountUsd: 2_000,
        reference: "badge-listing-points",
        paidVia: "BALANCE",
      },
    });
    expect((await getListing(listing.slug))?.sellerPoints).toBe(750);
  }),
);
