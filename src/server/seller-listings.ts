import "server-only";

import { randomBytes } from "node:crypto";
import type { ListingStatus, Platform } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import {
  fromCents,
  fromEngagementBp,
  type ListingDraft,
  toCents,
  toEngagementBp,
} from "@/lib/listing-form";

/**
 * The seller's own listings.
 *
 * Everything here takes a `sellerId` and filters on it. There is no "get by id"
 * that skips the owner check, because the moment one exists someone will call
 * it with an id from the URL and hand a stranger somebody else's draft.
 */

const PLATFORM_BY_ID: Record<string, Platform> = {
  youtube: "YOUTUBE",
  instagram: "INSTAGRAM",
  facebook: "FACEBOOK",
  telegram: "TELEGRAM",
  website: "WEBSITE",
};

const ID_BY_PLATFORM: Record<Platform, string> = {
  YOUTUBE: "youtube",
  INSTAGRAM: "instagram",
  FACEBOOK: "facebook",
  TELEGRAM: "telegram",
  WEBSITE: "website",
};

/** Statuses the seller can still edit. */
export const EDITABLE: readonly ListingStatus[] = ["DRAFT", "REJECTED"];

/** Statuses that mean the listing is out of the seller's hands for now. */
export const IN_REVIEW: readonly ListingStatus[] = [
  "CODE_CHECK",
  "ADMIN_REVIEW",
];

export type SellerListing = {
  id: string;
  slug: string;
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
  status: ListingStatus;
  ownershipCode: string | null;
  ownershipVerifiedAt: Date | null;
  rejectionReason: string | null;
  watching: number;
  createdAt: Date;
  updatedAt: Date;
  proofs: { id: string; url: string; label: string; sha256: string }[];
};

const select = {
  id: true,
  slug: true,
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
  status: true,
  ownershipCode: true,
  ownershipVerifiedAt: true,
  rejectionReason: true,
  watching: true,
  createdAt: true,
  updatedAt: true,
  proofs: {
    select: { id: true, url: true, label: true, fileHash: true },
    orderBy: { uploadedAt: "asc" },
  },
} as const;

function toSellerListing(row: {
  id: string;
  slug: string;
  platform: Platform;
  handle: string;
  title: string;
  niche: string;
  country: string;
  audience: number;
  monetized: boolean;
  monthlyRevenueUsd: number;
  engagementBp: number;
  ageYears: number;
  priceUsd: number;
  coverUrl: string;
  avatarUrl: string;
  transferProfile: string | null;
  status: ListingStatus;
  ownershipCode: string | null;
  ownershipVerifiedAt: Date | null;
  rejectionReason: string | null;
  watching: number;
  createdAt: Date;
  updatedAt: Date;
  proofs: { id: string; url: string; label: string; fileHash: string }[];
}): SellerListing {
  return {
    id: row.id,
    slug: row.slug,
    platform: ID_BY_PLATFORM[row.platform],
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
    status: row.status,
    ownershipCode: row.ownershipCode,
    ownershipVerifiedAt: row.ownershipVerifiedAt,
    rejectionReason: row.rejectionReason,
    watching: row.watching,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    proofs: row.proofs.map((proof) => ({
      id: proof.id,
      url: proof.url,
      label: proof.label,
      sha256: proof.fileHash,
    })),
  };
}

export async function getMyListings(
  sellerId: string,
): Promise<SellerListing[]> {
  const rows = await db.listing.findMany({
    where: { sellerId },
    select,
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(toSellerListing);
}

/** Returns null when the listing does not exist *or* is not theirs. */
export async function getMyListing(
  sellerId: string,
  id: string,
): Promise<SellerListing | null> {
  const row = await db.listing.findFirst({ where: { id, sellerId }, select });
  return row ? toSellerListing(row) : null;
}

function slugify(handle: string, platform: string) {
  return `${handle}-${platform}`
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * A slug nobody else is using.
 *
 * Checked against the table rather than an in-memory set, because two sellers
 * listing "@shopify" on the same platform is exactly the collision that would
 * otherwise blow up as a unique-constraint error mid-save.
 */
async function uniqueSlug(handle: string, platform: string, exceptId?: string) {
  const base = slugify(handle, platform) || "listing";
  for (let n = 1; n < 200; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const clash = await db.listing.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!clash || clash.id === exceptId) return candidate;
  }
  // 200 sellers with the same handle on one platform is not a real scenario,
  // but falling back beats throwing at the person mid-form.
  return `${base}-${randomBytes(4).toString("hex")}`;
}

function toColumns(input: ListingDraft) {
  return {
    platform: PLATFORM_BY_ID[input.platform],
    handle: input.handle,
    title: input.title,
    niche: input.niche,
    country: input.country,
    audience: input.audience,
    monetized: input.monetized,
    monthlyRevenueUsd: toCents(input.monthlyRevenue),
    engagementBp: toEngagementBp(input.engagement),
    ageYears: input.ageYears,
    priceUsd: toCents(input.price),
    coverUrl: input.coverUrl,
    avatarUrl: input.avatarUrl,
    transferProfile: input.transferProfile || null,
  };
}

export async function createDraft(sellerId: string, input: ListingDraft) {
  const slug = await uniqueSlug(input.handle, input.platform);
  const listing = await db.listing.create({
    data: {
      ...toColumns(input),
      slug,
      sellerId,
      status: "DRAFT",
      proofs: { create: input.proofs.map(proofRow) },
    },
    select: { id: true },
  });
  return listing.id;
}

function proofRow(p: { url: string; label: string; sha256: string }) {
  return { url: p.url, label: p.label, fileHash: p.sha256 };
}

/**
 * Saves an edit.
 *
 * Refuses anything that is not the seller's own and not currently editable, so
 * a live listing cannot have its price rewritten by replaying an old form
 * submission.
 */
export async function updateDraft(
  sellerId: string,
  id: string,
  input: ListingDraft,
) {
  const existing = await db.listing.findFirst({
    where: { id, sellerId },
    select: { id: true, status: true, handle: true, platform: true },
  });
  if (!existing) return { ok: false as const, reason: "not-found" as const };
  if (!EDITABLE.includes(existing.status)) {
    return { ok: false as const, reason: "locked" as const };
  }

  const platformChanged = ID_BY_PLATFORM[existing.platform] !== input.platform;
  const slug =
    existing.handle !== input.handle || platformChanged
      ? await uniqueSlug(input.handle, input.platform, id)
      : undefined;

  await db.$transaction([
    db.listingProof.deleteMany({ where: { listingId: id } }),
    db.listing.update({
      where: { id },
      data: {
        ...toColumns(input),
        ...(slug ? { slug } : {}),
        // Editing after a rejection clears the old reason, so the seller is
        // not left staring at feedback they have already acted on.
        rejectionReason: null,
        proofs: { create: input.proofs.map(proofRow) },
      },
    }),
  ]);

  return { ok: true as const };
}

/**
 * A code the seller puts in their public bio.
 *
 * Ambiguous characters are left out: this gets typed into a phone by someone
 * reading it off another screen, and "0 or O" is a support ticket.
 */
function newOwnershipCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let code = "";
  for (const b of bytes) code += alphabet[b % alphabet.length];
  return `CA-${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Moves a draft to the ownership check and issues its code. */
export async function startOwnershipCheck(sellerId: string, id: string) {
  const existing = await db.listing.findFirst({
    where: { id, sellerId },
    select: { id: true, status: true, ownershipCode: true },
  });
  if (!existing) return { ok: false as const, reason: "not-found" as const };

  // Already waiting on the code: hand back the one that was issued. Retrying
  // has to be safe — a double-click, or a refresh after a dropped response,
  // must not invalidate a code the seller has already pasted into their bio.
  if (existing.status === "CODE_CHECK" && existing.ownershipCode) {
    return { ok: true as const, code: existing.ownershipCode };
  }

  if (!EDITABLE.includes(existing.status)) {
    return { ok: false as const, reason: "locked" as const };
  }

  const code = existing.ownershipCode ?? newOwnershipCode();
  await db.listing.update({
    where: { id },
    data: { status: "CODE_CHECK", ownershipCode: code, rejectionReason: null },
  });
  return { ok: true as const, code };
}

/**
 * The seller says the code is live. That claim is not proof, so this hands the
 * listing to a moderator rather than publishing it.
 */
export async function submitForReview(sellerId: string, id: string) {
  const existing = await db.listing.findFirst({
    where: { id, sellerId },
    select: { id: true, status: true, _count: { select: { proofs: true } } },
  });
  if (!existing) return { ok: false as const, reason: "not-found" as const };
  if (existing.status !== "CODE_CHECK") {
    return { ok: false as const, reason: "wrong-status" as const };
  }
  if (existing._count.proofs === 0) {
    return { ok: false as const, reason: "no-proof" as const };
  }

  await db.listing.update({
    where: { id },
    data: { status: "ADMIN_REVIEW" },
  });
  return { ok: true as const };
}

/** Back to a draft, so the seller can fix something before review starts. */
export async function withdrawFromReview(sellerId: string, id: string) {
  const existing = await db.listing.findFirst({
    where: { id, sellerId },
    select: { id: true, status: true },
  });
  if (!existing) return { ok: false as const, reason: "not-found" as const };
  if (!IN_REVIEW.includes(existing.status)) {
    return { ok: false as const, reason: "wrong-status" as const };
  }
  await db.listing.update({ where: { id }, data: { status: "DRAFT" } });
  return { ok: true as const };
}

/** Pause hides a live listing; resume puts it back. */
export async function setPaused(sellerId: string, id: string, paused: boolean) {
  const existing = await db.listing.findFirst({
    where: { id, sellerId },
    select: { id: true, status: true },
  });
  if (!existing) return { ok: false as const, reason: "not-found" as const };

  const from = paused ? "LIVE" : "PAUSED";
  if (existing.status !== from) {
    return { ok: false as const, reason: "wrong-status" as const };
  }
  await db.listing.update({
    where: { id },
    data: { status: paused ? "PAUSED" : "LIVE" },
  });
  return { ok: true as const };
}

/**
 * Deletes a draft.
 *
 * Only ever a draft or a rejection. A listing that has been live may have
 * offers or an order against it, and those rows have to keep pointing at
 * something.
 */
export async function deleteDraft(sellerId: string, id: string) {
  const existing = await db.listing.findFirst({
    where: { id, sellerId },
    select: { id: true, status: true },
  });
  if (!existing) return { ok: false as const, reason: "not-found" as const };
  if (!EDITABLE.includes(existing.status)) {
    return { ok: false as const, reason: "locked" as const };
  }
  await db.listing.delete({ where: { id } });
  return { ok: true as const };
}
