import "server-only";

import type { ListingStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { fromCents, fromEngagementBp } from "@/lib/listing-form";

/**
 * The moderation side of listings.
 *
 * Separate from `seller-listings.ts` on purpose. That module scopes everything
 * to one seller; this one deliberately does not, and keeping the two apart
 * means an unscoped query can never be reached from a seller-facing path by
 * accident.
 */

export type QueueCounts = {
  awaitingReview: number;
  awaitingCode: number;
  live: number;
  rejected: number;
};

export async function getQueueCounts(): Promise<QueueCounts> {
  const [awaitingReview, awaitingCode, live, rejected] = await Promise.all([
    db.listing.count({ where: { status: "ADMIN_REVIEW" } }),
    db.listing.count({ where: { status: "CODE_CHECK" } }),
    db.listing.count({ where: { status: "LIVE" } }),
    db.listing.count({ where: { status: "REJECTED" } }),
  ]);
  return { awaitingReview, awaitingCode, live, rejected };
}

export type QueueItem = {
  id: string;
  title: string;
  handle: string;
  platform: string;
  price: number;
  status: ListingStatus;
  sellerName: string;
  sellerSlug: string | null;
  proofCount: number;
  waitingSince: Date;
};

/**
 * Oldest first. A queue worked newest-first leaves the unlucky at the bottom
 * forever, and the whole promise on the trust page is a predictable wait.
 */
export async function getReviewQueue(
  status: ListingStatus = "ADMIN_REVIEW",
): Promise<QueueItem[]> {
  const rows = await db.listing.findMany({
    where: { status },
    select: {
      id: true,
      title: true,
      handle: true,
      platform: true,
      priceUsd: true,
      status: true,
      updatedAt: true,
      seller: { select: { name: true, slug: true } },
      _count: { select: { proofs: true } },
    },
    orderBy: { updatedAt: "asc" },
    take: 100,
  });

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    handle: row.handle,
    platform: row.platform.toLowerCase(),
    price: fromCents(row.priceUsd),
    status: row.status,
    sellerName: row.seller.name,
    sellerSlug: row.seller.slug,
    proofCount: row._count.proofs,
    waitingSince: row.updatedAt,
  }));
}

export type ReviewProof = {
  id: string;
  url: string;
  label: string;
  /**
   * Other live or pending listings using this exact file. A screenshot that
   * turns up under two sellers means at least one of them does not own what
   * they are selling.
   */
  alsoUsedOn: { listingId: string; handle: string; sellerName: string }[];
};

export type ListingForReview = {
  id: string;
  slug: string;
  status: ListingStatus;
  platform: string;
  handle: string;
  title: string;
  niche: string;
  country: string;
  audience: number;
  monetized: boolean;
  monthlyRevenue: number;
  engagement: number;
  ageYears: number;
  price: number;
  coverUrl: string;
  avatarUrl: string;
  transferProfile: string | null;
  ownershipCode: string | null;
  ownershipVerifiedAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  seller: {
    id: string;
    name: string;
    email: string;
    slug: string | null;
    kycStatus: string;
    joinedAt: Date;
    liveListings: number;
    completedSales: number;
  };
  proofs: ReviewProof[];
};

export async function getListingForReview(
  id: string,
): Promise<ListingForReview | null> {
  const row = await db.listing.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      status: true,
      platform: true,
      handle: true,
      title: true,
      niche: true,
      country: true,
      audience: true,
      monetized: true,
      monthlyRevenueUsd: true,
      engagementBp: true,
      ageYears: true,
      priceUsd: true,
      coverUrl: true,
      avatarUrl: true,
      transferProfile: true,
      ownershipCode: true,
      ownershipVerifiedAt: true,
      rejectionReason: true,
      createdAt: true,
      updatedAt: true,
      sellerId: true,
      seller: {
        select: {
          id: true,
          name: true,
          email: true,
          slug: true,
          kycStatus: true,
          createdAt: true,
        },
      },
      proofs: {
        select: { id: true, url: true, label: true, fileHash: true },
        orderBy: { uploadedAt: "asc" },
      },
    },
  });
  if (!row) return null;

  const [liveListings, completedSales, duplicates] = await Promise.all([
    db.listing.count({ where: { sellerId: row.sellerId, status: "LIVE" } }),
    db.order.count({ where: { sellerId: row.sellerId, status: "COMPLETED" } }),
    row.proofs.length > 0
      ? db.listingProof.findMany({
          where: {
            fileHash: { in: row.proofs.map((p) => p.fileHash) },
            listingId: { not: row.id },
          },
          select: {
            fileHash: true,
            listing: {
              select: {
                id: true,
                handle: true,
                seller: { select: { name: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const byHash = new Map<string, ReviewProof["alsoUsedOn"]>();
  for (const dup of duplicates) {
    const list = byHash.get(dup.fileHash) ?? [];
    list.push({
      listingId: dup.listing.id,
      handle: dup.listing.handle,
      sellerName: dup.listing.seller.name,
    });
    byHash.set(dup.fileHash, list);
  }

  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    platform: row.platform.toLowerCase(),
    handle: row.handle,
    title: row.title,
    niche: row.niche,
    country: row.country,
    audience: row.audience,
    monetized: row.monetized,
    monthlyRevenue: fromCents(row.monthlyRevenueUsd),
    engagement: fromEngagementBp(row.engagementBp),
    ageYears: row.ageYears,
    price: fromCents(row.priceUsd),
    coverUrl: row.coverUrl,
    avatarUrl: row.avatarUrl,
    transferProfile: row.transferProfile,
    ownershipCode: row.ownershipCode,
    ownershipVerifiedAt: row.ownershipVerifiedAt,
    rejectionReason: row.rejectionReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    seller: {
      id: row.seller.id,
      name: row.seller.name,
      email: row.seller.email,
      slug: row.seller.slug,
      kycStatus: row.seller.kycStatus,
      joinedAt: row.seller.createdAt,
      liveListings,
      completedSales,
    },
    proofs: row.proofs.map((proof) => ({
      id: proof.id,
      url: proof.url,
      label: proof.label,
      alsoUsedOn: byHash.get(proof.fileHash) ?? [],
    })),
  };
}

/** What a moderator may act on. */
const REVIEWABLE: readonly ListingStatus[] = ["ADMIN_REVIEW"];

/**
 * A public profile handle for a seller who does not have one yet.
 *
 * Going live is the moment someone becomes a public seller, so it is the
 * moment they need an address. Without this, a first-time seller's listing is
 * LIVE in the database and a 404 on the site, because the listing page needs a
 * seller profile to link to — visible to nobody, and invisible as a bug.
 */
async function ensureSellerSlug(sellerId: string) {
  const seller = await db.user.findUniqueOrThrow({
    where: { id: sellerId },
    select: { slug: true, name: true, email: true },
  });
  if (seller.slug) return seller.slug;

  const base =
    seller.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) ||
    seller.email.split("@")[0].replace(/[^a-z0-9]+/g, "-") ||
    "seller";

  for (let n = 1; n < 200; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const taken = await db.user.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!taken) {
      await db.user.update({
        where: { id: sellerId },
        data: { slug: candidate },
      });
      return candidate;
    }
  }
  throw new Error(`could not find a free profile handle for ${sellerId}`);
}

export async function approveListing(id: string) {
  const existing = await db.listing.findUnique({
    where: { id },
    select: { id: true, status: true, ownershipCode: true, sellerId: true },
  });
  if (!existing) return { ok: false as const, reason: "not-found" as const };
  if (!REVIEWABLE.includes(existing.status)) {
    return { ok: false as const, reason: "wrong-status" as const };
  }

  // Before the listing is published, not after: a live listing with no seller
  // profile to point at is a 404 for every buyer who finds it.
  await ensureSellerSlug(existing.sellerId);

  const now = new Date();
  const updated = await db.listing.update({
    where: { id },
    data: {
      status: "LIVE",
      ownershipVerifiedAt: now,
      // The clock buyers see starts when the listing goes live, not when the
      // seller first opened the form. Otherwise a draft sat on for a month
      // appears on the site already looking stale.
      listedAt: now,
      rejectionReason: null,
    },
    select: { status: true, slug: true },
  });

  return {
    ok: true as const,
    before: existing.status,
    after: updated.status,
    slug: updated.slug,
  };
}

export async function rejectListing(id: string, reason: string) {
  const trimmed = reason.trim();
  if (trimmed.length < 10) {
    return { ok: false as const, reason: "reason-too-short" as const };
  }

  const existing = await db.listing.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing) return { ok: false as const, reason: "not-found" as const };
  if (!REVIEWABLE.includes(existing.status)) {
    return { ok: false as const, reason: "wrong-status" as const };
  }

  await db.listing.update({
    where: { id },
    data: { status: "REJECTED", rejectionReason: trimmed },
  });

  return {
    ok: true as const,
    before: existing.status,
    after: "REJECTED" as const,
  };
}

/** Pulls a live listing down. Used for reports and rule breaches. */
export async function removeListing(id: string, reason: string) {
  const trimmed = reason.trim();
  if (trimmed.length < 10) {
    return { ok: false as const, reason: "reason-too-short" as const };
  }

  const existing = await db.listing.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing) return { ok: false as const, reason: "not-found" as const };
  if (existing.status === "SOLD" || existing.status === "RESERVED") {
    // Money is already involved; taking the listing down would strand it.
    return { ok: false as const, reason: "wrong-status" as const };
  }

  await db.listing.update({
    where: { id },
    data: { status: "REMOVED", rejectionReason: trimmed },
  });

  return {
    ok: true as const,
    before: existing.status,
    after: "REMOVED" as const,
  };
}
