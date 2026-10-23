import "server-only";

import type { ListingStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { fromCents, fromEngagementBp } from "@/lib/listing-form";
import { recordAudit } from "@/server/audit";
import { notify } from "@/server/notifications";

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
  /** In a running deal. */
  reserved: number;
  /** Hidden by the seller, or by a suspension. */
  paused: number;
  sold: number;
  /** Taken down by staff. */
  removed: number;
};

/**
 * One grouped count rather than a query per tab: the staff layout reads this
 * on every page of the admin area, and the tabs went from four to eight.
 */
export async function getQueueCounts(): Promise<QueueCounts> {
  const groups = await db.listing.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const count = (status: ListingStatus) =>
    groups.find((g) => g.status === status)?._count._all ?? 0;

  return {
    awaitingReview: count("ADMIN_REVIEW"),
    awaitingCode: count("CODE_CHECK"),
    live: count("LIVE"),
    rejected: count("REJECTED"),
    reserved: count("RESERVED"),
    paused: count("PAUSED"),
    sold: count("SOLD"),
    removed: count("REMOVED"),
  };
}

export type QueueItem = {
  id: string;
  title: string;
  handle: string;
  platform: string;
  price: number;
  status: ListingStatus;
  featured: boolean;
  sellerName: string;
  sellerSlug: string | null;
  proofCount: number;
  waitingSince: Date;
};

/**
 * The archive views read newest first.
 *
 * Somebody opening "Taken down" is nearly always looking for the listing that
 * came down this morning, and with the hundred-row cap an oldest-first archive
 * would push exactly that one off the page for good.
 */
export const NEWEST_FIRST: readonly ListingStatus[] = [
  "REMOVED",
  "SOLD",
  "PAUSED",
];

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
      featured: true,
      updatedAt: true,
      seller: { select: { name: true, slug: true } },
      _count: { select: { proofs: true } },
    },
    orderBy: { updatedAt: NEWEST_FIRST.includes(status) ? "desc" : "asc" },
    take: 100,
  });

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    handle: row.handle,
    platform: row.platform.toLowerCase(),
    price: fromCents(row.priceUsd),
    status: row.status,
    featured: row.featured,
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
  /** Editorial promotion: the homepage showcase and the Featured badge. */
  featured: boolean;
  /**
   * The seller's WhatsApp, as they gave it on the listing. Staff-only — it is
   * never rendered to a buyer — and the reason it is collected at all is so a
   * transfer that stalls can be unstuck by somebody phoning the seller.
   */
  whatsapp: string | null;
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
      featured: true,
      whatsapp: true,
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
    featured: row.featured,
    whatsapp: row.whatsapp,
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

/**
 * Publishes a listing: a moderator's Approve, or — for a YouTube channel —
 * the ownership check itself, once Google has shown the seller's code in
 * the channel's own description. `by` only changes what the seller is told.
 */
export async function approveListing(
  id: string,
  by: "moderator" | "ownership-check" = "moderator",
) {
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

  await notify({
    userId: existing.sellerId,
    kind: "LISTING",
    title: "Your listing is live",
    body: "Buyers can find it and make offers on it now.",
    href: `/listing/${updated.slug}`,
    email: {
      subject: "Your listing is live on Channel Adda",
      body:
        by === "ownership-check"
          ? "We found your code on the channel, so it is on the marketplace. Buyers can find it and make offers on it now, and you can take the code out of your description."
          : "A moderator has checked it and it is on the marketplace. Buyers can find it and make offers on it now.",
    },
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
    select: { id: true, status: true, sellerId: true },
  });
  if (!existing) return { ok: false as const, reason: "not-found" as const };
  if (!REVIEWABLE.includes(existing.status)) {
    return { ok: false as const, reason: "wrong-status" as const };
  }

  await db.listing.update({
    where: { id },
    data: { status: "REJECTED", rejectionReason: trimmed },
  });

  // The reason travels with it. A seller who is only told “rejected” has
  // to come and ask, and most of them do not — they just leave.
  await notify({
    userId: existing.sellerId,
    kind: "LISTING",
    title: "Your listing needs a change before it can go live",
    body: trimmed,
    href: `/dashboard/listings/${id}`,
    email: {
      subject: "Your Channel Adda listing needs a change",
      body: [
        "A moderator has looked at your listing and it cannot go live as it is.",
        "",
        "What needs changing:",
        trimmed,
        "",
        "Edit it and send it back for review — the note clears when you save.",
      ].join("\n"),
    },
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
    select: { id: true, status: true, sellerId: true },
  });
  if (!existing) return { ok: false as const, reason: "not-found" as const };
  if (existing.status === "SOLD" || existing.status === "RESERVED") {
    // Money is already involved; taking the listing down would strand it.
    return { ok: false as const, reason: "wrong-status" as const };
  }

  // Compare-and-set on the status that was checked. A buyer can reserve the
  // listing between the read and this write, and an unconditional update
  // overwrote RESERVED with REMOVED under a deal that had money in it.
  const { count } = await db.listing.updateMany({
    where: { id, status: existing.status },
    data: { status: "REMOVED", rejectionReason: trimmed },
  });
  if (count === 0) {
    return { ok: false as const, reason: "wrong-status" as const };
  }

  await notify({
    userId: existing.sellerId,
    kind: "LISTING",
    title: "Your listing was taken down",
    body: trimmed,
    href: `/dashboard/listings/${id}`,
    email: {
      subject: "Your Channel Adda listing was taken down",
      body: [
        "A moderator has taken your listing off the marketplace.",
        "",
        "Why:",
        trimmed,
        "",
        "If you think this is a mistake, reply through support and a moderator can send it back to review.",
      ].join("\n"),
    },
  });

  return {
    ok: true as const,
    before: existing.status,
    after: "REMOVED" as const,
  };
}

/*
 * The two writes below record their own audit row, unlike the three above,
 * whose server actions write it. Same rule, different place: the row is
 * written by whatever does the work, so the work cannot be reached — from a
 * test, a script, a later caller — without the row coming with it. That is how
 * `resolveDeal` already does it.
 */

/**
 * A listing taken down in error, sent back to the review queue.
 *
 * Not straight back to LIVE: putting something in front of buyers is the
 * approval step's job, with its ownership check and its proof, and a takedown
 * reversed by one click from the archive would walk around both. In the queue
 * it is approved or sent back like any other listing.
 *
 * The reason is required for the same reason a takedown's is — it is the
 * record — and the seller hears about it, because a listing that vanished and
 * quietly reappeared in review is not something they can act on otherwise.
 */
export async function reopenListing(
  id: string,
  actorId: string,
  reason: string,
) {
  const trimmed = reason.trim();
  if (trimmed.length < 10) {
    return { ok: false as const, reason: "reason-too-short" as const };
  }

  const existing = await db.listing.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      rejectionReason: true,
      sellerId: true,
      seller: { select: { bannedAt: true } },
    },
  });
  if (!existing) return { ok: false as const, reason: "not-found" as const };
  if (existing.status !== "REMOVED") {
    return { ok: false as const, reason: "wrong-status" as const };
  }
  // A suspended seller's listing in the queue is one approval away from
  // being on sale while they cannot be reached or paid.
  if (existing.seller.bannedAt) {
    return { ok: false as const, reason: "seller-suspended" as const };
  }

  // Compare-and-set: two moderators reopening at once must not both notify.
  const moved = await db.listing.updateMany({
    where: { id, status: "REMOVED" },
    data: { status: "ADMIN_REVIEW", rejectionReason: null },
  });
  if (moved.count !== 1) {
    return { ok: false as const, reason: "wrong-status" as const };
  }

  await recordAudit({
    actorId,
    action: "listing.reopen",
    entity: "listing",
    entityId: id,
    // The takedown's own reason goes in `before`, because the column it lived
    // in is cleared here and the trail is now the only place it survives.
    before: { status: "REMOVED", reason: existing.rejectionReason },
    after: { status: "ADMIN_REVIEW", reason: trimmed },
  });

  // The bell, not an email: nothing here waits on the seller, and the
  // approval or rejection that follows sends its own.
  await notify({
    userId: existing.sellerId,
    kind: "LISTING",
    title: "Your listing is being reviewed again",
    body: trimmed,
    href: `/dashboard/listings/${id}`,
  });

  return {
    ok: true as const,
    before: "REMOVED" as const,
    after: "ADMIN_REVIEW" as const,
  };
}

/**
 * The homepage showcase.
 *
 * Live listings only, in both directions. Featuring anything else would
 * promote what no buyer can open; and the showcase only ever reads live
 * listings, so a flag left on a listing that has since sold or come down
 * changes nothing anybody sees.
 */
export async function setListingFeatured(
  id: string,
  actorId: string,
  featured: boolean,
) {
  const moved = await db.listing.updateMany({
    where: { id, status: "LIVE", featured: !featured },
    data: { featured },
  });

  if (moved.count !== 1) {
    const existing = await db.listing.findUnique({
      where: { id },
      select: { status: true, featured: true },
    });
    if (!existing) return { ok: false as const, reason: "not-found" as const };
    if (existing.status !== "LIVE") {
      return { ok: false as const, reason: "wrong-status" as const };
    }
    // Already as asked — a double click, or a colleague got there first.
    // Nothing changed, so nothing is written to the trail either.
    return { ok: true as const, changed: false as const, featured };
  }

  await recordAudit({
    actorId,
    action: featured ? "listing.feature" : "listing.unfeature",
    entity: "listing",
    entityId: id,
    before: { featured: !featured },
    after: { featured },
  });

  return { ok: true as const, changed: true as const, featured };
}
