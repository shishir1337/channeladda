import "server-only";
import type { PlatformId } from "@/data/platforms";
import type { Seller } from "@/data/sellers";
import { db } from "@/lib/db";
import type { VerifiedWith } from "@/lib/kyc";
import { ratingPoints } from "@/lib/reseller";
import { rankSellers } from "@/lib/seller-rank";
import { activeResellers } from "@/server/reseller-status";
import { getSettings } from "@/server/settings";
import { ratingPointsFor, trackRecord } from "@/server/track-record";

const PLATFORM_TO_ID = {
  YOUTUBE: "youtube",
  INSTAGRAM: "instagram",
  FACEBOOK: "facebook",
  TELEGRAM: "telegram",
  WEBSITE: "website",
} as const;

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase() || "DB";

/**
 * What the Verified badge's note names: the ID and the citizenship of the
 * approved check. Nothing for a badge approved by hand with no submission,
 * or while a new one waits.
 */
function verifiedWith(
  status: string,
  submission: {
    status: string;
    documentType: VerifiedWith["document"] | null;
    country: string;
  } | null,
): VerifiedWith | null {
  if (status !== "APPROVED" || submission?.status !== "APPROVED") return null;
  if (!submission.documentType) return null;
  return { document: submission.documentType, country: submission.country };
}

/**
 * A seller's public numbers are derived, never stored — settled volume and
 * rating come from completed orders and real reviews, so they cannot drift
 * from what actually happened.
 */
async function buildSeller(userId: string): Promise<Seller | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      reviewsGot: { select: { rating: true } },
      ordersSold: {
        where: { status: "COMPLETED" },
        select: { priceUsd: true },
      },
      listings: {
        where: { status: "LIVE" },
        select: { platform: true },
        distinct: ["platform"],
        // A fixed order, the same one /sellers lists them in.
        orderBy: { platform: "asc" },
      },
      kycSubmission: {
        select: { status: true, documentType: true, country: true },
      },
    },
  });
  if (!user?.slug) return null;

  const sales = user.ordersSold.length;
  const volume = user.ordersSold.reduce((n, o) => n + o.priceUsd, 0) / 100;
  // Null, not five. /sellers says these ratings come only from completed
  // orders and that there is no way to buy a review here — and then every
  // brand-new seller rendered five filled stars and “5.0”, disclosed only
  // by a “(0 reviews)” suffix beside it.
  const rating =
    user.reviewsGot.length > 0
      ? user.reviewsGot.reduce((n, r) => n + r.rating, 0) /
        user.reviewsGot.length
      : null;

  const [record, holders, settings] = await Promise.all([
    trackRecord(user.id),
    activeResellers([user.id]),
    getSettings(),
  ]);
  const reseller = holders.has(user.id);

  return {
    slug: user.slug,
    name: user.name,
    record,
    points: ratingPoints({
      worthCents: record.worthCents,
      multiplier: reseller ? settings.resellerPointsMultiplier : 1,
    }),
    reseller,
    // The Verified badge: an approved ID check, and nothing else.
    verified: user.kycStatus === "APPROVED",
    verifiedWith: verifiedWith(user.kycStatus, user.kycSubmission),
    initials: initialsOf(user.name),
    image: user.image,
    country: user.country ?? "Global",
    bio: user.bio,
    rating: rating === null ? null : Math.round(rating * 10) / 10,
    reviews: user.reviewsGot.length,
    sales,
    responseMins: user.responseMins ?? 15,
    memberSince: String(user.createdAt.getFullYear()),
    volume,
    specialties: user.listings.map(
      (l) => PLATFORM_TO_ID[l.platform] as PlatformId,
    ),
  };
}

export async function getSeller(slug: string): Promise<Seller | null> {
  const user = await db.user.findUnique({
    where: { slug },
    select: { id: true },
  });
  return user ? buildSeller(user.id) : null;
}

/** A seller in their place on /sellers, with what they have on sale now. */
export type RankedSeller = Seller & {
  /** 1 for the most rating points (`@/lib/seller-rank`). */
  rank: number;
  /** Live listings. */
  live: number;
  joinedAt: Date;
};

/**
 * Every verified seller, ranked by rating points, the most first: all of
 * /sellers, and the homepage's top four.
 *
 * The same figures `getSeller` builds for each seller's own page, read for
 * everyone at once — a handful of queries however many sellers there are,
 * where building them one by one took several queries per seller. A test
 * holds the two to the same numbers. Their track record is left out: no
 * list shows it.
 */
export async function getSellers(): Promise<RankedSeller[]> {
  const users = await db.user.findMany({
    where: { slug: { not: null }, kycStatus: "APPROVED" },
    select: {
      id: true,
      slug: true,
      name: true,
      image: true,
      country: true,
      bio: true,
      responseMins: true,
      createdAt: true,
      kycStatus: true,
      kycSubmission: {
        select: { status: true, documentType: true, country: true },
      },
    },
  });
  if (users.length === 0) return [];
  const ids = users.map((u) => u.id);

  const [sold, reviews, listings, points, holders] = await Promise.all([
    db.order.groupBy({
      by: ["sellerId"],
      where: { status: "COMPLETED", sellerId: { in: ids } },
      _count: { _all: true },
      _sum: { priceUsd: true },
    }),
    db.review.groupBy({
      by: ["subjectId"],
      where: { subjectId: { in: ids } },
      _count: { _all: true },
      _sum: { rating: true },
    }),
    db.listing.groupBy({
      by: ["sellerId", "platform"],
      where: { status: "LIVE", sellerId: { in: ids } },
      _count: { _all: true },
      orderBy: { platform: "asc" },
    }),
    ratingPointsFor(ids),
    activeResellers(ids),
  ]);

  const soldBy = new Map(sold.map((row) => [row.sellerId, row]));
  const reviewsOf = new Map(reviews.map((row) => [row.subjectId, row]));
  const liveOf = new Map<string, { live: number; platforms: PlatformId[] }>();
  for (const row of listings) {
    const entry = liveOf.get(row.sellerId) ?? { live: 0, platforms: [] };
    entry.live += row._count._all;
    entry.platforms.push(PLATFORM_TO_ID[row.platform]);
    liveOf.set(row.sellerId, entry);
  }

  const sellers = users.flatMap((user) => {
    if (!user.slug) return [];
    const sales = soldBy.get(user.id);
    const review = reviewsOf.get(user.id);
    const reviewCount = review?._count._all ?? 0;
    // As buildSeller: null until somebody has reviewed them, never five.
    const rating =
      reviewCount > 0 ? (review?._sum.rating ?? 0) / reviewCount : null;
    const live = liveOf.get(user.id);
    return [
      {
        slug: user.slug,
        name: user.name,
        points: points.get(user.id) ?? 0,
        reseller: holders.has(user.id),
        verified: user.kycStatus === "APPROVED",
        verifiedWith: verifiedWith(user.kycStatus, user.kycSubmission),
        initials: initialsOf(user.name),
        image: user.image,
        country: user.country ?? "Global",
        bio: user.bio,
        rating: rating === null ? null : Math.round(rating * 10) / 10,
        reviews: reviewCount,
        sales: sales?._count._all ?? 0,
        responseMins: user.responseMins ?? 15,
        memberSince: String(user.createdAt.getFullYear()),
        volume: (sales?._sum.priceUsd ?? 0) / 100,
        specialties: live?.platforms ?? [],
        live: live?.live ?? 0,
        joinedAt: user.createdAt,
      },
    ];
  });

  return rankSellers(sellers);
}

export async function getSellerSlugs(): Promise<string[]> {
  const users = await db.user.findMany({
    where: { slug: { not: null }, kycStatus: "APPROVED" },
    select: { slug: true },
  });
  return users.map((u) => u.slug as string);
}

/** Every public seller page, and when its member last changed, for the sitemap. */
export async function getSellerSitemap(): Promise<
  { slug: string; updatedAt: Date }[]
> {
  const users = await db.user.findMany({
    where: { slug: { not: null }, kycStatus: "APPROVED" },
    select: { slug: true, updatedAt: true },
  });
  return users.flatMap((u) =>
    u.slug ? [{ slug: u.slug, updatedAt: u.updatedAt }] : [],
  );
}

/** Headline figures for the homepage and about page. */
export async function getSiteStats() {
  const [settled, transfers, verifiedSellers] = await Promise.all([
    db.order.aggregate({
      where: { status: "COMPLETED" },
      _sum: { priceUsd: true },
    }),
    db.order.count({ where: { status: "COMPLETED" } }),
    db.user.count({ where: { kycStatus: "APPROVED" } }),
  ]);

  return {
    settledUsd: (settled._sum.priceUsd ?? 0) / 100,
    transfers,
    verifiedSellers,
  };
}
