/**
 * Seeds the database from the Phase 1 fixtures so the public site renders
 * identically against Postgres. Idempotent: it clears and rebuilds.
 *
 * Run with `pnpm db:seed`.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import {
  avatarSrc,
  coverSrc,
  listings,
  recentlySold,
} from "../src/data/listings";
import type { PlatformId } from "../src/data/platforms";
import { platformMap } from "../src/data/platforms";
import { sellers } from "../src/data/sellers";
import { testimonials } from "../src/data/site";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL as string,
  }),
});

const usd = (dollars: number) => Math.round(dollars * 100);
const PLATFORM = {
  youtube: "YOUTUBE",
  instagram: "INSTAGRAM",
  facebook: "FACEBOOK",
  telegram: "TELEGRAM",
  website: "WEBSITE",
} as const;

const toPlatform = (id: PlatformId) => PLATFORM[id];

/** Deterministic dates relative to now, so seeded data always looks fresh. */
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000);

/** Readable, unique, stable: handle + platform, de-duplicated with a counter. */
const usedSlugs = new Set<string>();
function slugify(handle: string, platform: PlatformId) {
  const base = `${handle}-${platform}`
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  let slug = base;
  let n = 2;
  while (usedSlugs.has(slug)) slug = `${base}-${n++}`;
  usedSlugs.add(slug);
  return slug;
}

const DEV_PASSWORD = "channeladda-dev-2026";

async function main() {
  console.log("clearing…");
  // Order matters: children before parents.
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.report.deleteMany();
  await prisma.withdrawal.deleteMany();
  await prisma.ledgerEntry.deleteMany();
  await prisma.review.deleteMany();
  await prisma.dispute.deleteMany();
  await prisma.message.deleteMany();
  await prisma.transferStep.deleteMany();
  await prisma.order.deleteMany();
  await prisma.offer.deleteMany();
  await prisma.favourite.deleteMany();
  await prisma.listingProof.deleteMany();
  await prisma.listing.deleteMany();
  await prisma.payoutAddress.deleteMany();
  await prisma.kycSubmission.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.verification.deleteMany();
  await prisma.user.deleteMany();
  usedSlugs.clear();

  // Better Auth stores this on Account, and hashes with scrypt rather than
  // bcrypt. Hash once — it is the same password for every seeded account.
  const passwordHash = await hashPassword(DEV_PASSWORD);

  // ---- staff -------------------------------------------------------------
  console.log("staff…");
  await prisma.user.createMany({
    data: [
      {
        email: "moderator@channeladda.com",
        role: "MODERATOR",
        name: "Aisha Rahman",
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
      {
        email: "finance@channeladda.com",
        role: "FINANCE",
        name: "Marcus Bell",
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
      {
        email: "admin@channeladda.com",
        role: "SUPERADMIN",
        name: "Owner",
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    ],
  });

  // ---- sellers -----------------------------------------------------------
  console.log(`sellers (${sellers.length})…`);
  const sellerIdBySlug = new Map<string, string>();
  for (const s of sellers) {
    const user = await prisma.user.create({
      data: {
        email: `${s.slug}@example.com`,
        emailVerified: true,
        emailVerifiedAt: daysAgo(400),
        slug: s.slug,
        name: s.name,
        country: s.country,
        avatarSeed: s.slug,
        kycStatus: "APPROVED",
        kycDocHash: `seed-${s.slug}`,
        responseMins: s.responseMins,
        createdAt: new Date(`${s.memberSince}-03-01`),
        payoutAddress: {
          create: {
            address: `T${s.slug.replace(/-/g, "").slice(0, 12).toUpperCase()}XXXXXXXXXXXXXX`,
            network: "TRON",
          },
        },
      },
    });
    sellerIdBySlug.set(s.slug, user.id);
  }

  // ---- buyers (reviewers from the homepage) ------------------------------
  console.log("buyers…");
  const buyerIdBySlug = new Map<string, string>();
  for (const t of testimonials) {
    const user = await prisma.user.create({
      data: {
        email: `${t.avatar}@example.com`,
        emailVerified: true,
        emailVerifiedAt: daysAgo(200),
        slug: t.avatar,
        name: t.name,
        avatarSeed: t.avatar,
        createdAt: daysAgo(300),
      },
    });
    buyerIdBySlug.set(t.avatar, user.id);
  }

  // ---- sign-in credentials ----------------------------------------------
  // Better Auth keeps the password on Account, not User, so every seeded user
  // needs one of these before they can sign in. providerId "credential" is its
  // name for password login; the issuer is the namespace it looks the row up by.
  console.log("credentials…");
  const allUsers = await prisma.user.findMany({ select: { id: true } });
  await prisma.account.createMany({
    data: allUsers.map((u) => ({
      userId: u.id,
      accountId: u.id,
      providerId: "credential",
      issuer: "local:credential",
      password: passwordHash,
      updatedAt: new Date(),
    })),
  });

  // ---- live listings -----------------------------------------------------
  console.log(`listings (${listings.length})…`);
  const listingIdByFixture = new Map<string, string>();
  for (const l of listings) {
    const sellerId = sellerIdBySlug.get(l.sellerSlug);
    if (!sellerId) throw new Error(`unknown seller ${l.sellerSlug}`);

    const created = await prisma.listing.create({
      data: {
        sellerId,
        platform: toPlatform(l.platform),
        handle: l.handle,
        title: l.title,
        niche: l.niche,
        country: l.country,
        audience: l.audience,
        monetized: l.monetized,
        monthlyRevenueUsd: usd(l.monthlyRevenue),
        engagementBp: Math.round(l.engagement * 10),
        ageYears: l.ageYears,
        priceUsd: usd(l.price),
        wasPriceUsd: l.wasPrice ? usd(l.wasPrice) : null,
        slug: slugify(l.handle, l.platform),
        coverUrl: coverSrc(l.id),
        avatarUrl: avatarSrc(l.id),
        featured: l.tag === "featured",
        status: "LIVE",
        ownershipCode: `CA-${l.id.toUpperCase().replace("-", "")}`,
        ownershipVerifiedAt: l.ownershipVerified
          ? daysAgo(l.listedDaysAgo)
          : null,
        transferProfile: l.platform === "youtube" ? "Brand Account" : null,
        watching: l.watching,
        listedAt: daysAgo(l.listedDaysAgo),
        createdAt: daysAgo(l.listedDaysAgo + 1),
        proofs: {
          create: [1, 2, 3].map((n) => ({
            url: `/media/proof/${l.platform}-${n}.svg`,
            label: [
              "Audience growth, last 12 months",
              "Reach and engagement breakdown",
              "Revenue and payouts history",
            ][n - 1],
            fileHash: `${l.id}-proof-${n}`,
          })),
        },
      },
    });
    listingIdByFixture.set(l.id, created.id);
  }

  // ---- completed sales ---------------------------------------------------
  console.log(`completed orders (${recentlySold.length})…`);
  const buyerIds = [...buyerIdBySlug.values()];
  const sellerIds = [...sellerIdBySlug.values()];

  for (const [i, sale] of recentlySold.entries()) {
    const sellerId = sellerIds[i % sellerIds.length];
    const buyerId = buyerIds[i % buyerIds.length];
    const platform = platformMap[sale.platform];

    const soldListing = await prisma.listing.create({
      data: {
        sellerId,
        platform: toPlatform(sale.platform),
        handle: sale.handle,
        title: `${sale.niche} ${platform.assetNoun.replace(/s$/, "")} sold through Channel Adda escrow`,
        niche: sale.niche,
        country: "Global",
        audience: sale.audience,
        monetized: true,
        monthlyRevenueUsd: usd(Math.round(sale.price / 20)),
        engagementBp: 50,
        ageYears: 3,
        priceUsd: usd(sale.price),
        slug: slugify(sale.handle, sale.platform),
        coverUrl: coverSrc(sale.id),
        avatarUrl: avatarSrc(sale.id),
        status: "SOLD",
        ownershipVerifiedAt: hoursAgo(
          sale.soldHoursAgo + sale.daysToClose * 24,
        ),
        listedAt: hoursAgo(sale.soldHoursAgo + sale.daysToClose * 24),
        createdAt: hoursAgo(sale.soldHoursAgo + sale.daysToClose * 24 + 24),
      },
    });

    const price = usd(sale.price);
    const buyerFee = Math.round(price * 0.03);
    const sellerFee = Math.round(price * 0.05);
    const completedAt = hoursAgo(sale.soldHoursAgo);

    const order = await prisma.order.create({
      data: {
        reference: `CA-${40000 + i}`,
        listingId: soldListing.id,
        buyerId,
        sellerId,
        mode: "ESCROW",
        status: "COMPLETED",
        priceUsd: price,
        buyerFeeUsd: buyerFee,
        sellerFeeUsd: sellerFee,
        totalUsd: price + buyerFee,
        paymentRef: `cryptomus_seed_${i}`,
        paymentAsset: "USDT",
        paidAt: hoursAgo(sale.soldHoursAgo + sale.daysToClose * 24),
        revenueRiskAcceptedAt: hoursAgo(
          sale.soldHoursAgo + sale.daysToClose * 24,
        ),
        confirmedAt: hoursAgo(sale.soldHoursAgo + platform.holdDays * 24),
        holdUntil: completedAt,
        completedAt,
        createdAt: hoursAgo(sale.soldHoursAgo + sale.daysToClose * 24),
        steps: {
          create: platform.transferSteps.map((label, position) => ({
            position,
            label,
            actor: position < 3 ? "seller" : "buyer",
            completedAt: hoursAgo(
              sale.soldHoursAgo + platform.holdDays * 24 + 1,
            ),
          })),
        },
      },
    });

    // Double-entry: money in, fees out, remainder to the seller.
    await prisma.ledgerEntry.createMany({
      data: [
        {
          orderId: order.id,
          kind: "ESCROW_HOLD",
          amountUsd: price + buyerFee,
          note: "Buyer payment received",
          createdAt: order.paidAt ?? completedAt,
        },
        {
          orderId: order.id,
          kind: "BUYER_FEE",
          amountUsd: -buyerFee,
          note: "Platform buyer fee",
          createdAt: order.paidAt ?? completedAt,
        },
        {
          orderId: order.id,
          kind: "SELLER_FEE",
          amountUsd: -sellerFee,
          note: "Platform seller fee",
          createdAt: completedAt,
        },
        {
          orderId: order.id,
          userId: sellerId,
          kind: "ESCROW_RELEASE",
          amountUsd: price - sellerFee,
          note: "Escrow released to seller",
          createdAt: completedAt,
        },
      ],
    });
  }

  // ---- historical trading history ----------------------------------------
  // The 24 above are fully detailed for the /sold page. These are the rest of
  // the marketplace's past: enough real completed orders that the headline
  // figures are derived rather than invented.
  console.log("historical orders…");

  const HISTORY = 1500;
  const NICHES = [
    "Tech & Reviews",
    "Fitness",
    "Food",
    "Travel",
    "Gaming",
    "Finance",
    "Crypto",
    "Pets",
    "Education",
    "Fashion",
    "Music",
    "Home",
  ];
  const PLATFORM_IDS = [
    "youtube",
    "instagram",
    "facebook",
    "telegram",
    "website",
  ] as const;

  // Deterministic pseudo-random so reseeding gives the same marketplace.
  let seedState = 987654321;
  const rnd = () => {
    seedState = (seedState * 1103515245 + 12345) & 0x7fffffff;
    return seedState / 0x7fffffff;
  };

  const histListings = await prisma.listing.createManyAndReturn({
    data: Array.from({ length: HISTORY }, (_, i) => {
      const pid = PLATFORM_IDS[Math.floor(rnd() * PLATFORM_IDS.length)];
      const platform = platformMap[pid];
      const audience = Math.round(20_000 + rnd() * 2_000_000);
      // Price roughly tracks audience, with real spread.
      const price = Math.round((audience / 1000) * (8 + rnd() * 34));
      const soldDaysAgo = 8 + Math.floor(rnd() * 720);
      const artIndex = (i % 24) + 1;
      const art = `s-${String(artIndex).padStart(2, "0")}`;
      return {
        sellerId: sellerIds[i % sellerIds.length],
        platform: toPlatform(pid),
        slug: `archive-${i + 1}-${pid}`,
        handle: `Archived ${platform.name} ${platform.assetNoun.replace(/s$/, "")} #${i + 1}`,
        title: `${NICHES[i % NICHES.length]} ${platform.assetNoun.replace(/s$/, "")} settled through Channel Adda escrow`,
        niche: NICHES[i % NICHES.length],
        country: "Global",
        audience,
        monetized: rnd() > 0.35,
        monthlyRevenueUsd: usd(Math.round(price / 22)),
        engagementBp: Math.round(20 + rnd() * 150),
        ageYears: 1 + Math.floor(rnd() * 8),
        priceUsd: usd(price),
        coverUrl: coverSrc(art),
        avatarUrl: avatarSrc(art),
        status: "SOLD" as const,
        ownershipVerifiedAt: daysAgo(soldDaysAgo + 20),
        listedAt: daysAgo(soldDaysAgo + 20),
        createdAt: daysAgo(soldDaysAgo + 21),
      };
    }),
    select: { id: true, sellerId: true, priceUsd: true, createdAt: true },
  });

  const histOrders = await prisma.order.createManyAndReturn({
    data: histListings.map((l, i) => {
      const price = l.priceUsd;
      const buyerFee = Math.round(price * 0.03);
      const sellerFee = Math.round(price * 0.05);
      const closedDays = 4 + Math.floor(rnd() * 24);
      const completedAt = new Date(
        l.createdAt.getTime() + closedDays * 86_400_000,
      );
      return {
        reference: `CA-${100000 + i}`,
        listingId: l.id,
        buyerId: buyerIds[i % buyerIds.length],
        sellerId: l.sellerId,
        mode: "ESCROW" as const,
        status: "COMPLETED" as const,
        priceUsd: price,
        buyerFeeUsd: buyerFee,
        sellerFeeUsd: sellerFee,
        totalUsd: price + buyerFee,
        paymentRef: `cryptomus_hist_${i}`,
        paymentAsset: "USDT",
        paidAt: l.createdAt,
        revenueRiskAcceptedAt: l.createdAt,
        confirmedAt: completedAt,
        holdUntil: completedAt,
        completedAt,
        createdAt: l.createdAt,
      };
    }),
    select: {
      id: true,
      sellerId: true,
      priceUsd: true,
      buyerFeeUsd: true,
      sellerFeeUsd: true,
      completedAt: true,
    },
  });

  await prisma.ledgerEntry.createMany({
    data: histOrders.flatMap((o) => [
      {
        orderId: o.id,
        kind: "ESCROW_HOLD" as const,
        amountUsd: o.priceUsd + o.buyerFeeUsd,
        note: "Buyer payment received",
        createdAt: o.completedAt ?? new Date(),
      },
      {
        orderId: o.id,
        kind: "BUYER_FEE" as const,
        amountUsd: -o.buyerFeeUsd,
        note: "Platform buyer fee",
        createdAt: o.completedAt ?? new Date(),
      },
      {
        orderId: o.id,
        kind: "SELLER_FEE" as const,
        amountUsd: -o.sellerFeeUsd,
        note: "Platform seller fee",
        createdAt: o.completedAt ?? new Date(),
      },
      {
        orderId: o.id,
        userId: o.sellerId,
        kind: "ESCROW_RELEASE" as const,
        amountUsd: o.priceUsd - o.sellerFeeUsd,
        note: "Escrow released to seller",
        createdAt: o.completedAt ?? new Date(),
      },
    ]),
  });

  // ---- reviews on the three homepage testimonials ------------------------
  console.log("reviews…");
  const completed = await prisma.order.findMany({
    where: { status: "COMPLETED", reference: { startsWith: "CA-4" } },
    orderBy: { completedAt: "desc" },
    take: testimonials.length,
  });
  for (const [i, t] of testimonials.entries()) {
    const order = completed[i];
    if (!order) break;
    await prisma.review.create({
      data: {
        orderId: order.id,
        authorId: order.buyerId,
        subjectId: order.sellerId,
        rating: t.rating,
        body: t.quote,
        createdAt: order.completedAt ?? new Date(),
      },
    });
  }

  const counts = {
    users: await prisma.user.count(),
    listings: await prisma.listing.count(),
    live: await prisma.listing.count({ where: { status: "LIVE" } }),
    orders: await prisma.order.count(),
    ledger: await prisma.ledgerEntry.count(),
    reviews: await prisma.review.count(),
    settledUsd:
      ((
        await prisma.order.aggregate({
          where: { status: "COMPLETED" },
          _sum: { priceUsd: true },
        })
      )._sum.priceUsd ?? 0) / 100,
  };
  console.log("seeded:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
