import "server-only";
import type { Listing, SoldItem } from "@/data/listings";
import type { PlatformId } from "@/data/platforms";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  type Facet,
  type ListingFilters,
  PAGE_SIZE,
  type QueryResult,
  type SortKey,
} from "@/lib/listing-query";

/** DB stores money in cents and engagement in tenths of a percent. */
const toUsd = (cents: number) => cents / 100;
const toPct = (bp: number) => bp / 10;

const PLATFORM_TO_ID = {
  YOUTUBE: "youtube",
  INSTAGRAM: "instagram",
  FACEBOOK: "facebook",
  TELEGRAM: "telegram",
  WEBSITE: "website",
} as const;

/** Display names, kept here so this module never imports the icon components. */
const PLATFORM_NAME = {
  youtube: "YouTube",
  instagram: "Instagram",
  facebook: "Facebook",
  telegram: "Telegram",
  website: "Website",
} as const;

const ID_TO_PLATFORM = {
  youtube: "YOUTUBE",
  instagram: "INSTAGRAM",
  facebook: "FACEBOOK",
  telegram: "TELEGRAM",
  website: "WEBSITE",
} as const;

type Row = Prisma.ListingGetPayload<{
  include: { seller: { select: { slug: true; name: true } } };
}>;

const DAY = 86_400_000;

/** A listing is "hot" once this many people are watching it. */
const HOT_WATCHING = 100;
/** Anything listed inside this window still counts as new. */
const NEW_DAYS = 3;

/**
 * Card badges. Only `featured` is editorial and stored; the rest are facts
 * about the row, so deriving them keeps them true without anyone maintaining
 * them. Precedence matters — a listing only ever shows one badge.
 */
function deriveTag(
  row: Row,
  listedDaysAgo: number,
): Listing["tag"] | undefined {
  if (row.featured) return "featured";
  if (row.wasPriceUsd !== null) return "ending";
  if (listedDaysAgo <= NEW_DAYS) return "new";
  if (row.watching >= HOT_WATCHING) return "hot";
  return undefined;
}

/** Maps a DB row onto the shape the components already consume. */
type SellerStat = { name: string; rating: number; sales: number };

/**
 * Rating and completed sales for a page of listings, in two queries rather
 * than two per card.
 */
async function sellerStatsFor(
  sellerIds: string[],
): Promise<Map<string, SellerStat>> {
  const unique = [...new Set(sellerIds)];
  if (unique.length === 0) return new Map();

  const [people, ratings, sales] = await Promise.all([
    db.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true },
    }),
    db.review.groupBy({
      by: ["subjectId"],
      where: { subjectId: { in: unique } },
      _avg: { rating: true },
    }),
    db.order.groupBy({
      by: ["sellerId"],
      where: { sellerId: { in: unique }, status: "COMPLETED" },
      _count: { _all: true },
    }),
  ]);

  const ratingBy = new Map(ratings.map((r) => [r.subjectId, r._avg.rating]));
  const salesBy = new Map(sales.map((r) => [r.sellerId, r._count._all]));

  return new Map(
    people.map((person) => [
      person.id,
      {
        name: person.name,
        // A seller with no reviews yet reads as 5.0 rather than 0.0, which
        // would look like a bad seller instead of a new one.
        rating: ratingBy.get(person.id) ?? 5,
        sales: salesBy.get(person.id) ?? 0,
      },
    ]),
  );
}

/** Maps a page of rows, attaching the seller stats they all need. */
async function toListings(rows: Row[]): Promise<Listing[]> {
  const stats = await sellerStatsFor(rows.map((row) => row.sellerId));
  return rows.map((row) => toListing(row, stats.get(row.sellerId)));
}

function toListing(row: Row, seller?: SellerStat): Listing {
  const listedDaysAgo = Math.max(
    0,
    Math.round((Date.now() - row.listedAt.getTime()) / DAY),
  );

  return {
    id: row.id,
    slug: row.slug,
    platform: PLATFORM_TO_ID[row.platform] as PlatformId,
    handle: row.handle,
    title: row.title,
    audience: row.audience,
    monetized: row.monetized,
    monthlyRevenue: toUsd(row.monthlyRevenueUsd),
    niche: row.niche,
    country: row.country,
    engagement: toPct(row.engagementBp),
    ageYears: row.ageYears,
    price: toUsd(row.priceUsd),
    wasPrice: row.wasPriceUsd ? toUsd(row.wasPriceUsd) : undefined,
    ownershipVerified: row.ownershipVerifiedAt !== null,
    coverUrl: row.coverUrl,
    avatarUrl: row.avatarUrl,
    sellerSlug: row.seller.slug ?? "",
    sellerName: seller?.name ?? row.seller.name,
    sellerRating: seller?.rating ?? 5,
    sellerSales: seller?.sales ?? 0,
    watching: row.watching,
    listedDaysAgo,
    tag: deriveTag(row, listedDaysAgo),
  };
}

const include = {
  seller: { select: { slug: true, name: true } },
} as const;

/**
 * Every filter as its own `where` fragment, so facet counts can rebuild the
 * set with a single fragment removed — the same trick the in-memory engine
 * used, now expressed in SQL.
 */
function fragments(f: ListingFilters) {
  const q = f.q.trim();
  return {
    base: { status: "LIVE" } as Prisma.ListingWhereInput,
    q: q
      ? ({
          OR: [
            { handle: { contains: q, mode: "insensitive" } },
            { title: { contains: q, mode: "insensitive" } },
            { niche: { contains: q, mode: "insensitive" } },
            { country: { contains: q, mode: "insensitive" } },
          ],
        } as Prisma.ListingWhereInput)
      : {},
    platforms: f.platforms.length
      ? ({
          platform: { in: f.platforms.map((p) => ID_TO_PLATFORM[p]) },
        } as Prisma.ListingWhereInput)
      : {},
    niches: f.niches.length
      ? ({ niche: { in: f.niches } } as Prisma.ListingWhereInput)
      : {},
    countries: f.countries.length
      ? ({ country: { in: f.countries } } as Prisma.ListingWhereInput)
      : {},
    price:
      f.priceMin !== undefined || f.priceMax !== undefined
        ? ({
            priceUsd: {
              ...(f.priceMin !== undefined ? { gte: f.priceMin * 100 } : {}),
              ...(f.priceMax !== undefined ? { lte: f.priceMax * 100 } : {}),
            },
          } as Prisma.ListingWhereInput)
        : {},
    audience:
      f.audienceMin !== undefined || f.audienceMax !== undefined
        ? ({
            audience: {
              ...(f.audienceMin !== undefined ? { gte: f.audienceMin } : {}),
              ...(f.audienceMax !== undefined ? { lte: f.audienceMax } : {}),
            },
          } as Prisma.ListingWhereInput)
        : {},
    monetized:
      f.monetized !== undefined
        ? ({ monetized: f.monetized } as Prisma.ListingWhereInput)
        : {},
    verified: f.verifiedOnly
      ? ({ ownershipVerifiedAt: { not: null } } as Prisma.ListingWhereInput)
      : {},
    revenue:
      f.revenueMin !== undefined
        ? ({
            monthlyRevenueUsd: { gte: f.revenueMin * 100 },
          } as Prisma.ListingWhereInput)
        : {},
    age:
      f.ageMin !== undefined
        ? ({ ageYears: { gte: f.ageMin } } as Prisma.ListingWhereInput)
        : {},
  };
}

function whereFrom(
  parts: Prisma.ListingWhereInput[],
): Prisma.ListingWhereInput {
  return { AND: parts.filter((p) => Object.keys(p).length > 0) };
}

function orderBy(sort: SortKey): Prisma.ListingOrderByWithRelationInput {
  switch (sort) {
    case "price-asc":
      return { priceUsd: "asc" };
    case "price-desc":
      return { priceUsd: "desc" };
    case "audience-desc":
      return { audience: "desc" };
    case "revenue-desc":
      return { monthlyRevenueUsd: "desc" };
    case "engagement-desc":
      return { engagementBp: "desc" };
    default:
      return { listedAt: "desc" };
  }
}

export async function queryListings(f: ListingFilters): Promise<QueryResult> {
  const frag = fragments(f);
  const all = Object.values(frag);
  const where = whereFrom(all);

  const [total, priceAgg] = await Promise.all([
    db.listing.count({ where }),
    db.listing.aggregate({
      where: { status: "LIVE" },
      _min: { priceUsd: true },
      _max: { priceUsd: true },
    }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(f.page, pageCount);

  const rows = await db.listing.findMany({
    where,
    include,
    orderBy: orderBy(f.sort),
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  // Facet counts: rebuild the filter set with the counted dimension lifted.
  const without = (key: keyof typeof frag) =>
    whereFrom(
      Object.entries(frag)
        .filter(([k]) => k !== key)
        .map(([, v]) => v),
    );

  const [platformGroups, nicheGroups, countryGroups] = await Promise.all([
    db.listing.groupBy({
      by: ["platform"],
      where: without("platforms"),
      _count: { _all: true },
    }),
    db.listing.groupBy({
      by: ["niche"],
      where: without("niches"),
      _count: { _all: true },
    }),
    db.listing.groupBy({
      by: ["country"],
      where: without("countries"),
      _count: { _all: true },
    }),
  ]);

  const platformCounts = new Map(
    platformGroups.map((g) => [PLATFORM_TO_ID[g.platform], g._count._all]),
  );

  const byCount = (a: Facet, b: Facet) =>
    b.count - a.count || a.label.localeCompare(b.label);

  return {
    items: await toListings(rows),
    total,
    page,
    pageCount,
    facets: {
      platforms: (Object.keys(ID_TO_PLATFORM) as PlatformId[]).map((id) => ({
        value: id,
        label: PLATFORM_NAME[id],
        count: platformCounts.get(id) ?? 0,
      })),
      niches: nicheGroups
        .map((g) => ({ value: g.niche, label: g.niche, count: g._count._all }))
        .sort(byCount),
      countries: countryGroups
        .map((g) => ({
          value: g.country,
          label: g.country,
          count: g._count._all,
        }))
        .sort(byCount),
    },
    priceBounds: {
      min: toUsd(priceAgg._min.priceUsd ?? 0),
      max: toUsd(priceAgg._max.priceUsd ?? 0),
    },
  };
}

export async function getListing(slug: string): Promise<Listing | null> {
  const row = await db.listing.findFirst({
    where: { slug, status: { in: ["LIVE", "RESERVED"] } },
    include,
  });
  if (!row) return null;
  const stats = await sellerStatsFor([row.sellerId]);
  return toListing(row, stats.get(row.sellerId));
}

export async function getListingSlugs(): Promise<string[]> {
  const rows = await db.listing.findMany({
    where: { status: "LIVE" },
    select: { slug: true },
  });
  return rows.map((r) => r.slug);
}

export async function getSimilarListings(
  listing: Listing,
  take = 3,
): Promise<Listing[]> {
  const rows = await db.listing.findMany({
    where: {
      status: "LIVE",
      id: { not: listing.id },
      OR: [
        { platform: ID_TO_PLATFORM[listing.platform] },
        { niche: listing.niche },
      ],
    },
    include,
    orderBy: [{ listedAt: "desc" }],
    take: take * 3,
  });

  // Same platform first, then same niche — ranked in app code because the
  // ordering is a product decision, not a query concern.
  const score = (l: Listing) =>
    (l.platform === listing.platform ? 2 : 0) +
    (l.niche === listing.niche ? 1 : 0);

  return (await toListings(rows))
    .sort((a, b) => score(b) - score(a) || a.listedDaysAgo - b.listedDaysAgo)
    .slice(0, take);
}

/** Homepage grid: newest first, enough to fill all four tabs. */
export async function getFeaturedListings(take = 24): Promise<Listing[]> {
  const rows = await db.listing.findMany({
    where: { status: "LIVE" },
    include,
    orderBy: [{ featured: "desc" }, { listedAt: "desc" }],
    take,
  });
  return toListings(rows);
}

export async function getSellerListings(slug: string): Promise<Listing[]> {
  const rows = await db.listing.findMany({
    where: { status: "LIVE", seller: { slug } },
    include,
    orderBy: { listedAt: "desc" },
  });
  return toListings(rows);
}

/** Live listing count per platform, for the category tiles. */
export async function getPlatformCounts(): Promise<Record<PlatformId, number>> {
  const groups = await db.listing.groupBy({
    by: ["platform"],
    where: { status: "LIVE" },
    _count: { _all: true },
  });
  const out = {
    youtube: 0,
    instagram: 0,
    facebook: 0,
    telegram: 0,
    website: 0,
  } as Record<PlatformId, number>;
  for (const g of groups) out[PLATFORM_TO_ID[g.platform]] = g._count._all;
  return out;
}

export async function getRecentlySold(take = 24): Promise<SoldItem[]> {
  const orders = await db.order.findMany({
    where: { status: "COMPLETED" },
    include: { listing: true },
    orderBy: { completedAt: "desc" },
    take,
  });

  return orders.map((o) => ({
    id: o.id,
    platform: PLATFORM_TO_ID[o.listing.platform] as PlatformId,
    handle: o.listing.handle,
    niche: o.listing.niche,
    audience: o.listing.audience,
    price: toUsd(o.priceUsd),
    soldHoursAgo: Math.max(
      0,
      (Date.now() - (o.completedAt ?? o.createdAt).getTime()) / 3_600_000,
    ),
    daysToClose: Math.max(
      1,
      Math.round(
        ((o.completedAt ?? o.createdAt).getTime() - o.createdAt.getTime()) /
          DAY,
      ),
    ),
  }));
}
