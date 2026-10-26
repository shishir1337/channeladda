import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import type { OrderStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { getRecentlySold, getSoldTotals, median } from "@/server/listings";
import { getSellers } from "@/server/sellers";
import { seedListing, withCleanDb } from "@/test/db";

// QA, 2026-10-26: /sold said "Deals shown 24 · Settled value $261.1K" and
// /sellers "Completed sales 24 · Settled volume $415.8K". Two different
// sets — the newest 24 sales by anyone, and every sale by a verified seller
// — that read as one count disagreeing with itself.

async function sale(input: {
  sellerId: string;
  buyerId: string;
  priceCents: number;
  days: number;
  status?: OrderStatus;
}) {
  const listing = await db.listing.create({
    data: {
      slug: `sold-${randomUUID().slice(0, 8)}`,
      sellerId: input.sellerId,
      platform: "YOUTUBE",
      handle: "@sold",
      title: "Sold",
      niche: "Tech",
      country: "Global",
      audience: 10_000,
      engagementBp: 50,
      ageYears: 2,
      priceUsd: input.priceCents,
      coverUrl: "/uploads/test-cover.png",
      avatarUrl: "/uploads/test-avatar.png",
      status: "SOLD",
    },
  });
  const completedAt = new Date();
  return db.order.create({
    data: {
      reference: `CA-${randomUUID().slice(0, 8)}`,
      listingId: listing.id,
      buyerId: input.buyerId,
      sellerId: input.sellerId,
      mode: "SAFEST",
      status: input.status ?? "COMPLETED",
      priceUsd: input.priceCents,
      buyerFeeUsd: 0,
      sellerFeeUsd: 0,
      totalUsd: input.priceCents,
      createdAt: new Date(completedAt.getTime() - input.days * 86_400_000),
      completedAt: input.status ? null : completedAt,
    },
  });
}

test(
  "/sold totals every completed sale, not only the ones it lists",
  withCleanDb(async () => {
    const { seller: verified, buyer } = await seedListing();
    const unverified = await db.user.create({
      data: { email: `${randomUUID()}@example.test`, name: "New Seller" },
    });

    await sale({
      sellerId: verified.id,
      buyerId: buyer.id,
      priceCents: 100_00,
      days: 2,
    });
    await sale({
      sellerId: verified.id,
      buyerId: buyer.id,
      priceCents: 300_00,
      days: 8,
    });
    await sale({
      sellerId: unverified.id,
      buyerId: buyer.id,
      priceCents: 50_00,
      days: 4,
    });
    await sale({
      sellerId: verified.id,
      buyerId: buyer.id,
      priceCents: 999_00,
      days: 1,
      status: "CANCELLED",
    });

    const totals = await getSoldTotals();
    expect(totals).toEqual({ sales: 3, valueUsd: 450, medianDays: 4 });

    // The list is the newest few; the totals do not shrink with it.
    expect(await getRecentlySold(2)).toHaveLength(2);

    // /sellers counts its own sellers only — verified ones — and says so.
    const sellers = await getSellers();
    expect(sellers.reduce((n, s) => n + s.sales, 0)).toBe(2);
    expect(sellers.reduce((n, s) => n + s.volume, 0)).toBe(400);
  }),
);

test("the median of an even count is the two middle ones averaged", () => {
  expect(median([])).toBeNull();
  expect(median([8, 2, 5])).toBe(5);
  expect(median([1, 2, 6, 9])).toBe(4);
});
