import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import type {
  ListingStatus,
  OrderStatus,
  Platform,
} from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { getSeller, getSellers } from "@/server/sellers";
import { seedListing, seedUser, withCleanDb } from "@/test/db";

// /sellers lists every verified seller by rating points, 1st at the top, and
// the homepage's "Top sellers" are its first four. The numbers have to be the
// ones each seller's own page shows, read for everyone at once.

async function verifiedSeller(name: string, joined: string) {
  return db.user.create({
    data: {
      email: `${randomUUID()}@example.test`,
      name,
      slug: `${name.toLowerCase().replace(/\s+/g, "-")}-${randomUUID().slice(0, 6)}`,
      kycStatus: "APPROVED",
      country: "India",
      createdAt: new Date(joined),
    },
  });
}

async function listing(
  sellerId: string,
  status: ListingStatus = "LIVE",
  platform: Platform = "YOUTUBE",
) {
  return db.listing.create({
    data: {
      slug: `listing-${randomUUID().slice(0, 8)}`,
      sellerId,
      platform,
      handle: "@channel",
      title: "Channel",
      niche: "Tech",
      country: "Global",
      audience: 10_000,
      engagementBp: 50,
      ageYears: 2,
      priceUsd: 10_000,
      coverUrl: "/uploads/test-cover.png",
      avatarUrl: "/uploads/test-avatar.png",
      status,
    },
  });
}

async function sale(input: {
  sellerId: string;
  buyerId: string;
  priceCents: number;
  status?: OrderStatus;
}) {
  const { id: listingId } = await listing(input.sellerId, "SOLD");
  return db.order.create({
    data: {
      reference: `CA-${randomUUID().slice(0, 8)}`,
      listingId,
      buyerId: input.buyerId,
      sellerId: input.sellerId,
      mode: "SAFEST",
      status: input.status ?? "COMPLETED",
      priceUsd: input.priceCents,
      buyerFeeUsd: 0,
      sellerFeeUsd: 0,
      totalUsd: input.priceCents,
    },
  });
}

test(
  "every verified seller, the most rating points first",
  withCleanDb(async () => {
    const { buyer } = await seedListing();
    const small = await verifiedSeller("Small", "2023-01-01");
    const big = await verifiedSeller("Big", "2024-01-01");
    const none = await verifiedSeller("None", "2022-01-01");
    // $500 is 250 points, $2,000 is 1,000.
    await sale({ sellerId: small.id, buyerId: buyer.id, priceCents: 50_000 });
    await sale({ sellerId: big.id, buyerId: buyer.id, priceCents: 200_000 });
    // A deal still running earns nothing yet.
    await sale({
      sellerId: none.id,
      buyerId: buyer.id,
      priceCents: 900_000,
      status: "IN_CUSTODY",
    });
    // Not verified, or never listed: not on the page at all.
    await db.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        name: "Pending",
        slug: `pending-${randomUUID().slice(0, 6)}`,
        kycStatus: "PENDING",
      },
    });

    const ranked = await getSellers();
    const ours = ranked.filter((s) =>
      [small.slug, big.slug, none.slug].includes(s.slug),
    );
    expect(ours.map((s) => [s.rank, s.name, s.points])).toEqual([
      [1, "Big", 1_000],
      [2, "Small", 250],
      // seedListing's own seller joined today, after "None": both have 0.
      [3, "None", 0],
    ]);
    expect(ranked.map((s) => s.rank)).toEqual(ranked.map((_, i) => i + 1));
    expect(ranked.some((s) => s.name === "Pending")).toBe(false);
  }),
);

test(
  "on the same points, more sales go first, then whoever joined earlier",
  withCleanDb(async () => {
    const { buyer } = await seedListing();
    const oneSale = await verifiedSeller("One Sale", "2020-01-01");
    const twoSales = await verifiedSeller("Two Sales", "2025-01-01");
    const older = await verifiedSeller("Older", "2021-01-01");
    const newer = await verifiedSeller("Newer", "2022-01-01");
    // 500 points each.
    await sale({
      sellerId: oneSale.id,
      buyerId: buyer.id,
      priceCents: 100_000,
    });
    await sale({
      sellerId: twoSales.id,
      buyerId: buyer.id,
      priceCents: 50_000,
    });
    await sale({
      sellerId: twoSales.id,
      buyerId: buyer.id,
      priceCents: 50_000,
    });
    await sale({ sellerId: newer.id, buyerId: buyer.id, priceCents: 100_000 });
    await sale({ sellerId: older.id, buyerId: buyer.id, priceCents: 100_000 });

    const names = (await getSellers())
      .filter((s) => s.points === 500)
      .map((s) => s.name);
    expect(names).toEqual(["Two Sales", "One Sale", "Older", "Newer"]);
  }),
);

test(
  "the Reseller badge's multiplier counts toward the place",
  withCleanDb(async () => {
    const { buyer } = await seedListing();
    const plain = await verifiedSeller("Plain", "2020-01-01");
    const badge = await verifiedSeller("Badge", "2024-01-01");
    await sale({ sellerId: plain.id, buyerId: buyer.id, priceCents: 100_000 });
    await sale({ sellerId: badge.id, buyerId: buyer.id, priceCents: 50_000 });
    const now = Date.now();
    await db.resellerPass.create({
      data: {
        userId: badge.id,
        startsAt: new Date(now - 86_400_000),
        endsAt: new Date(now + 29 * 86_400_000),
        amountUsd: 2_000,
        reference: "badge-sellers-rank",
        paidVia: "BALANCE",
      },
    });

    const [first, second] = await getSellers();
    // 250 points, tripled to 750, beats 500.
    expect([first.name, first.points, first.reseller]).toEqual([
      "Badge",
      750,
      true,
    ]);
    expect([second.name, second.points, second.reseller]).toEqual([
      "Plain",
      500,
      false,
    ]);
  }),
);

test(
  "the list shows each seller the numbers their own page does",
  withCleanDb(async () => {
    const { buyer, seller: seeded } = await seedListing();
    const other = await seedUser();
    const a = await verifiedSeller("Asha Rao", "2023-05-01");
    const b = await verifiedSeller("Bilal Khan", "2024-02-01");

    await listing(a.id, "LIVE", "INSTAGRAM");
    await listing(a.id, "LIVE", "YOUTUBE");
    await listing(a.id, "LIVE", "YOUTUBE");
    await listing(a.id, "PAUSED", "TELEGRAM");
    const first = await sale({
      sellerId: a.id,
      buyerId: buyer.id,
      priceCents: 125_000,
    });
    const second = await sale({
      sellerId: a.id,
      buyerId: other.id,
      priceCents: 40_000,
    });
    // Points come from either side of the table: Bilal bought from Asha.
    await sale({ sellerId: a.id, buyerId: b.id, priceCents: 60_000 });
    await db.review.createMany({
      data: [
        {
          orderId: first.id,
          authorId: buyer.id,
          subjectId: a.id,
          rating: 5,
          body: "Smooth.",
        },
        {
          orderId: second.id,
          authorId: other.id,
          subjectId: a.id,
          rating: 4,
          body: "Fine.",
        },
      ],
    });

    const ranked = await getSellers();
    expect(ranked.map((s) => s.slug).sort()).toEqual(
      [a.slug, b.slug, seeded.slug].sort(),
    );

    for (const listed of ranked) {
      const { rank, live, joinedAt, ...shown } = listed;
      const own = await getSeller(listed.slug);
      if (!own) throw new Error(`${listed.slug} has no page of their own`);
      const { record, ...page } = own;
      expect(shown).toEqual(page);
      expect(rank).toBeGreaterThan(0);
      expect(joinedAt).toBeInstanceOf(Date);
      expect(record).toBeDefined();
      expect(live).toBeGreaterThanOrEqual(0);
    }

    const asha = ranked.find((s) => s.slug === a.slug);
    expect(asha).toMatchObject({
      rank: 1,
      // $2,250 sold: 1,125 points.
      points: 1_125,
      sales: 3,
      volume: 2_250,
      rating: 4.5,
      reviews: 2,
      live: 3,
      specialties: ["youtube", "instagram"],
    });
    expect(ranked.find((s) => s.slug === b.slug)).toMatchObject({
      rank: 2,
      // $600 bought: 300 points, and no sales of his own.
      points: 300,
      sales: 0,
      live: 0,
      specialties: [],
    });
  }),
);

test(
  "no verified sellers is an empty page, not an error",
  withCleanDb(async () => {
    expect(await getSellers()).toEqual([]);
  }),
);
