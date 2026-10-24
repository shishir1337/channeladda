import "server-only";
import type { PlatformId } from "@/data/platforms";
import type { Seller } from "@/data/sellers";
import { db } from "@/lib/db";
import { ratingPoints } from "@/lib/reseller";
import { activeResellers } from "@/server/reseller-status";
import { getSettings } from "@/server/settings";
import { trackRecord } from "@/server/track-record";

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
    initials: initialsOf(user.name),
    image: user.image,
    country: user.country ?? "Global",
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

export async function getSellers(): Promise<Seller[]> {
  const users = await db.user.findMany({
    where: { slug: { not: null }, kycStatus: "APPROVED" },
    select: { id: true },
  });
  const built = await Promise.all(users.map((u) => buildSeller(u.id)));
  return built
    .filter((s): s is Seller => s !== null)
    .sort((a, b) => b.volume - a.volume);
}

export async function getSellerSlugs(): Promise<string[]> {
  const users = await db.user.findMany({
    where: { slug: { not: null }, kycStatus: "APPROVED" },
    select: { slug: true },
  });
  return users.map((u) => u.slug as string);
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
