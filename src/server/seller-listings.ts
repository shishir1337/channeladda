import "server-only";

import { randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { ListingStatus, Platform } from "@/generated/prisma/enums";
import { money } from "@/lib/chat-events";
import { db } from "@/lib/db";
import { TERMINAL_STATUSES } from "@/lib/deal-machine";
import {
  fromCents,
  fromEngagementBp,
  type ListingDraft,
  type ListingLiveEdit,
  toCents,
  toEngagementBp,
} from "@/lib/listing-form";
import {
  audienceFromYouTube,
  DELETABLE,
  LIVE_EDITABLE,
  type ListingLock,
  lockOfStatus,
  REMOVABLE,
  SELLER_REMOVED_REASON,
} from "@/lib/listing-lock";
import { recordAudit } from "@/server/audit";
import { postEvent } from "@/server/chat-events";
import { paymentInProgress } from "@/server/listing-hold";
import { notify } from "@/server/notifications";
import { markUploadsAttached } from "@/server/upload-access";

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
  yearlyRevenue: number;
  sourceUrl: string | null;
  externalId: string | null;
  description: string | null;
  /** Staff only. Never put on a page a buyer can open. */
  whatsapp: string | null;
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
  yearlyRevenueUsd: true,
  sourceUrl: true,
  externalId: true,
  description: true,
  whatsapp: true,
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
  yearlyRevenueUsd: number;
  sourceUrl: string | null;
  externalId: string | null;
  description: string | null;
  whatsapp: string | null;
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
    yearlyRevenue: fromCents(row.yearlyRevenueUsd),
    sourceUrl: row.sourceUrl,
    externalId: row.externalId,
    description: row.description,
    whatsapp: row.whatsapp,
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

/**
 * A number the column will accept.
 *
 * A draft may be saved half-finished, and the form sends `NaN` for a number
 * field nobody has filled in. The columns behind them are NOT NULL integers,
 * so without this the save passes validation and then fails at the database
 * — which is the same dead end one step further along.
 */
const orZero = (value: number) => (Number.isFinite(value) ? value : 0);

function toColumns(input: ListingDraft) {
  return {
    platform: PLATFORM_BY_ID[input.platform],
    handle: input.handle,
    title: input.title,
    niche: input.niche,
    country: input.country,
    audience: orZero(input.audience),
    monetized: input.monetized,
    monthlyRevenueUsd: toCents(orZero(input.monthlyRevenue)),
    yearlyRevenueUsd: toCents(orZero(input.yearlyRevenue)),
    sourceUrl: input.sourceUrl || null,
    description: input.description || null,
    whatsapp: input.whatsapp || null,
    engagementBp: toEngagementBp(orZero(input.engagement)),
    ageYears: orZero(input.ageYears),
    priceUsd: toCents(orZero(input.price)),
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
  await markUploadsAttached(attachedUrls(input));
  return listing.id;
}

/** Every uploaded file a draft points at. */
function attachedUrls(input: ListingDraft) {
  return [input.coverUrl, input.avatarUrl, ...input.proofs.map((p) => p.url)];
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
  await markUploadsAttached(attachedUrls(input));

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

  // A suspension pauses reserved listings too, and their deals keep going.
  // Resuming one of those mid-deal put the channel back on sale while the
  // first buyer was still paying for it. It resumes once the deal is over.
  if (!paused) {
    const running = await db.order.count({
      where: { listingId: id, status: { notIn: [...TERMINAL_STATUSES] } },
    });
    if (running > 0) {
      return { ok: false as const, reason: "in-deal" as const };
    }
  }

  const { count } = await db.listing.updateMany({
    where: { id, status: from },
    data: { status: paused ? "PAUSED" : "LIVE" },
  });
  if (count === 0) {
    return { ok: false as const, reason: "wrong-status" as const };
  }
  return { ok: true as const };
}

/**
 * Deals that still hold a listing: paid, opened from an offer the seller
 * accepted (the two `holdingOrders` counts), or past the opening payment by
 * any other road. Only an unpaid deal waiting on its first payment may be
 * closed under a buyer, because nothing has moved on it yet. Without a
 * listing id, every such deal on the listings matched by `listing`.
 */
function lockingDeals(
  listingId: string | null,
  listing?: Prisma.ListingWhereInput,
): Prisma.OrderWhereInput {
  return {
    ...(listingId ? { listingId } : {}),
    ...(listing ? { listing } : {}),
    status: { notIn: [...TERMINAL_STATUSES] },
    OR: [
      { paymentRef: { not: null } },
      { offerId: { not: null } },
      { status: { not: "AWAITING_PAYMENT" } },
    ],
  };
}

/** Unpaid deals a removal closes: waiting on a first payment nobody made. */
function closeableDeals(listingId: string): Prisma.OrderWhereInput {
  return {
    listingId,
    status: "AWAITING_PAYMENT",
    paymentRef: null,
    offerId: null,
  };
}

async function lockOf(listing: {
  id: string;
  status: ListingStatus;
}): Promise<ListingLock | null> {
  const byStatus = lockOfStatus(listing.status);
  if (byStatus) return byStatus;
  const running = await db.order.count({ where: lockingDeals(listing.id) });
  return running > 0 ? "in-deal" : null;
}

/**
 * Which of a seller's live or paused listings a running deal holds, for the
 * list page: one query for every row rather than one per row.
 */
export async function lockedListingIds(sellerId: string): Promise<Set<string>> {
  const rows = await db.order.findMany({
    where: lockingDeals(null, {
      sellerId,
      status: { in: [...LIVE_EDITABLE] },
    }),
    select: { listingId: true },
    distinct: ["listingId"],
  });
  return new Set(rows.map((row) => row.listingId));
}

export type ListingLocks = {
  /** Why it cannot change or come down now, or null when it can. */
  lock: ListingLock | null;
  canEdit: boolean;
  canRemove: boolean;
  /** What removing it would close, so the confirmation can say so. */
  openOffers: number;
  unpaidDeals: number;
  /** A buyer's crypto payment is on its way; removal waits for it. */
  paying: boolean;
  /** Removing it deletes it: a draft nothing has ever pointed at. */
  deletes: boolean;
};

/** What the seller can do to this listing right now, for the listing page. */
export async function getListingLocks(
  sellerId: string,
  id: string,
): Promise<ListingLocks | null> {
  const listing = await db.listing.findFirst({
    where: { id, sellerId },
    select: { id: true, status: true, _count: { select: HISTORY } },
  });
  if (!listing) return null;

  const [lock, openOffers, unpaidDeals, paying] = await Promise.all([
    lockOf(listing),
    db.offer.count({ where: { listingId: id, status: "OPEN" } }),
    db.order.count({ where: closeableDeals(id) }),
    paymentInProgress(id, ""),
  ]);

  return {
    lock,
    canEdit: lock === null && LIVE_EDITABLE.includes(listing.status),
    canRemove: lock === null && REMOVABLE.includes(listing.status),
    openOffers,
    unpaidDeals,
    paying,
    deletes: deletesOutright(listing),
  };
}

/**
 * Everything that points at a listing from someone else's side. Lines in
 * a conversation rather than conversations: a conversation is two people
 * now, and what is about this listing is the lines that say so.
 */
const HISTORY = { orders: true, offers: true, messages: true } as const;

/**
 * Whether removing this listing deletes it. Only a draft or a returned
 * listing nothing has ever pointed at: one that was once on sale (taken
 * down, reopened, sent back) still has its buyers' threads and deals, and
 * deleting it would take their chats with it — or fail outright on a deal.
 */
function deletesOutright(listing: {
  status: ListingStatus;
  _count: { orders: number; offers: number; messages: number };
}) {
  const { orders, offers, messages } = listing._count;
  return DELETABLE.includes(listing.status) && orders + offers + messages === 0;
}

/** One spelling of a handle or link, so "@Name/" and "name" compare equal. */
const identityKey = (value: string | null | undefined) =>
  (value ?? "").trim().replace(/^@/, "").replace(/\/+$/, "").toLowerCase();

/** The columns a live edit writes, from the form's dollars and percents. */
function liveColumns(input: ListingLiveEdit) {
  return {
    title: input.title,
    niche: input.niche,
    country: input.country,
    audience: input.audience,
    monetized: input.monetized,
    monthlyRevenueUsd: toCents(input.monthlyRevenue),
    yearlyRevenueUsd: toCents(input.yearlyRevenue),
    engagementBp: toEngagementBp(input.engagement),
    ageYears: input.ageYears,
    priceUsd: toCents(input.price),
    coverUrl: input.coverUrl,
    avatarUrl: input.avatarUrl,
    transferProfile: input.transferProfile || null,
    description: input.description || null,
    whatsapp: input.whatsapp || null,
  };
}

type LiveColumns = ReturnType<typeof liveColumns>;

export type LiveEditRefusal =
  | "not-found"
  | "wrong-status"
  | "identity"
  | "verified-audience"
  | "changed"
  | ListingLock;

/**
 * Saves an edit to a listing buyers can already see.
 *
 * It applies at once, with no second review: the owner's call. What keeps
 * that safe is what it cannot touch — which account this is, and the figure
 * YouTube itself supplied — and the audit row, which keeps every changed
 * field as it was and as it is now, under the seller's name, for staff.
 *
 * A new price is for deals opened from now on. A deal already open carries
 * its own price, and an offer its own amount, so neither moves.
 */
export async function updateLiveListing(
  sellerId: string,
  id: string,
  input: ListingLiveEdit,
): Promise<
  | { ok: true; changed: (keyof LiveColumns)[]; slug: string }
  | { ok: false; reason: LiveEditRefusal }
> {
  const existing = await db.listing.findFirst({
    where: { id, sellerId },
    select: {
      id: true,
      slug: true,
      status: true,
      platform: true,
      handle: true,
      sourceUrl: true,
      externalId: true,
      ownershipVerifiedAt: true,
      wasPriceUsd: true,
      title: true,
      niche: true,
      country: true,
      audience: true,
      monetized: true,
      monthlyRevenueUsd: true,
      yearlyRevenueUsd: true,
      engagementBp: true,
      ageYears: true,
      priceUsd: true,
      coverUrl: true,
      avatarUrl: true,
      transferProfile: true,
      description: true,
      whatsapp: true,
    },
  });
  if (!existing) return { ok: false, reason: "not-found" };

  const statusLock = lockOfStatus(existing.status);
  if (statusLock) return { ok: false, reason: statusLock };
  if (!LIVE_EDITABLE.includes(existing.status)) {
    return { ok: false, reason: "wrong-status" };
  }

  // Which account this is. Sent only by a form that should not have, or by
  // somebody replaying one: refused out loud rather than dropped, so nobody
  // believes they re-pointed a verified listing at another channel.
  if (
    (input.platform !== undefined &&
      PLATFORM_BY_ID[input.platform] !== existing.platform) ||
    (input.handle !== undefined &&
      identityKey(input.handle) !== identityKey(existing.handle)) ||
    (input.sourceUrl !== undefined &&
      identityKey(input.sourceUrl) !== identityKey(existing.sourceUrl))
  ) {
    return { ok: false, reason: "identity" };
  }

  const next = liveColumns(input);
  if (audienceFromYouTube(existing) && next.audience !== existing.audience) {
    return { ok: false, reason: "verified-audience" };
  }

  if ((await db.order.count({ where: lockingDeals(id) })) > 0) {
    return { ok: false, reason: "in-deal" };
  }

  const changed = (Object.keys(next) as (keyof LiveColumns)[]).filter(
    (key) => next[key] !== existing[key],
  );
  if (changed.length === 0) {
    return { ok: true, changed, slug: existing.slug };
  }

  // A "was" price at or under the new one would show a rise as a cut.
  const priceRose =
    existing.wasPriceUsd !== null && next.priceUsd >= existing.wasPriceUsd;

  // Compare-and-set on the status read above: a payment landing in between
  // reserves the listing, and this must not write over a sale in progress.
  const { count } = await db.listing.updateMany({
    where: { id, sellerId, status: existing.status },
    data: { ...next, ...(priceRose ? { wasPriceUsd: null } : {}) },
  });
  if (count === 0) {
    // Say what it changed to: a buyer's payment reserving it is the likely
    // one, and that has its own words.
    const after = await db.listing.findUnique({
      where: { id },
      select: { status: true },
    });
    const lock = after ? lockOfStatus(after.status) : null;
    return { ok: false, reason: lock ?? "changed" };
  }

  await markUploadsAttached([next.coverUrl, next.avatarUrl]);
  await recordAudit({
    actorId: sellerId,
    action: "listing.edit",
    entity: "listing",
    entityId: id,
    before: Object.fromEntries(changed.map((key) => [key, existing[key]])),
    after: Object.fromEntries(changed.map((key) => [key, next[key]])),
  });

  return { ok: true, changed, slug: existing.slug };
}

export type RemoveRefusal =
  | "not-found"
  | "paying"
  | "changed"
  | Exclude<ListingLock, "removed">;

type ClosedDeal = { orderId: string; buyerId: string; reference: string };
type ClosedOffer = {
  buyerId: string;
  amountUsd: number;
  thread: string | null;
};

class RemoveAbort extends Error {
  constructor(readonly reason: RemoveRefusal) {
    super(reason);
  }
}

const DEAL_CLOSED =
  "The seller took this listing off the marketplace, so this deal has closed. Nothing was charged";

/**
 * The seller takes their listing away, whatever stage it is at.
 *
 * A draft or a returned listing nobody has ever written to is deleted, as
 * before. Anything else leaves the marketplace for good — REMOVED, with a
 * note saying the seller did it — because a listing that has been in front
 * of buyers has their conversations, offers and deals pointing at it, and
 * those have to keep pointing at something.
 *
 * Unpaid deals close and open offers are declined in the same transaction
 * that takes the listing down, each with a line in its own chat, and every
 * buyer is told. Refused while a deal holds it — paid, or from an offer the
 * seller accepted — and while a crypto payment is on its way, so nobody's
 * money arrives at a listing that has gone.
 */
export async function removeMyListing(
  sellerId: string,
  id: string,
): Promise<
  | { ok: true; outcome: "deleted" | "removed"; slug: string }
  | { ok: false; reason: RemoveRefusal }
> {
  const existing = await db.listing.findFirst({
    where: { id, sellerId },
    select: {
      id: true,
      slug: true,
      status: true,
      _count: { select: HISTORY },
    },
  });
  if (!existing) return { ok: false, reason: "not-found" };
  // Already gone — a second tap, or a moderator got there first.
  if (existing.status === "REMOVED") {
    return { ok: true, outcome: "removed", slug: existing.slug };
  }
  const statusLock = lockOfStatus(existing.status);
  if (statusLock && statusLock !== "removed") {
    return { ok: false, reason: statusLock };
  }

  if (deletesOutright(existing)) {
    const { count } = await db.listing.deleteMany({
      where: { id, sellerId, status: existing.status },
    });
    if (count === 0) return { ok: false, reason: "changed" };
    return { ok: true, outcome: "deleted", slug: existing.slug };
  }

  if (await paymentInProgress(id, "")) return { ok: false, reason: "paying" };

  const now = new Date();
  let closed: { deals: ClosedDeal[]; offers: ClosedOffer[] };
  try {
    closed = await db.$transaction(async (tx) => {
      // Off the marketplace first, so no payment or acceptance can take it
      // while the rest closes. Compare-and-set: one that landed between the
      // read above and here has reserved it, and wins.
      const { count } = await tx.listing.updateMany({
        where: { id, sellerId, status: existing.status },
        data: { status: "REMOVED", rejectionReason: SELLER_REMOVED_REASON },
      });
      if (count === 0) throw new RemoveAbort("changed");

      // A paused listing can still carry a paid deal (a suspension pauses
      // reserved listings and their deals go on), so this is asked here too.
      if ((await tx.order.count({ where: lockingDeals(id) })) > 0) {
        throw new RemoveAbort("in-deal");
      }

      const deals: ClosedDeal[] = [];
      const unpaid = await tx.order.findMany({
        where: closeableDeals(id),
        select: {
          id: true,
          buyerId: true,
          reference: true,
          conversationId: true,
        },
      });
      for (const order of unpaid) {
        const moved = await tx.order.updateMany({
          where: { id: order.id, ...closeableDeals(id) },
          data: { status: "CANCELLED", cancelledAt: now },
        });
        if (moved.count !== 1) continue;
        if (order.conversationId) {
          await postEvent(tx, {
            conversationId: order.conversationId,
            kind: "EVENT",
            event: { type: "deal-ended", outcome: DEAL_CLOSED },
            senderId: null,
            orderId: order.id,
            at: now,
          });
        }
        deals.push({
          orderId: order.id,
          buyerId: order.buyerId,
          reference: order.reference,
        });
      }

      const offers: ClosedOffer[] = [];
      const open = await tx.offer.findMany({
        where: { listingId: id, status: "OPEN" },
        select: { id: true, buyerId: true, amountUsd: true, bySeller: true },
      });
      for (const offer of open) {
        // A buyer's offer is declined. A price the seller put to a buyer is
        // theirs to take back, so it reads as withdrawn.
        const moved = await tx.offer.updateMany({
          where: { id: offer.id, status: "OPEN" },
          data: {
            status: offer.bySeller ? "WITHDRAWN" : "REJECTED",
            respondedAt: now,
          },
        });
        if (moved.count !== 1) continue;
        const thread = await tx.conversation.findUnique({
          where: {
            buyerId_sellerId: { buyerId: offer.buyerId, sellerId },
          },
          select: { id: true },
        });
        if (thread) {
          await postEvent(tx, {
            conversationId: thread.id,
            kind: "EVENT",
            event: {
              type: "offer-listing-removed",
              amountCents: offer.amountUsd,
            },
            senderId: null,
            offerId: offer.id,
            listingId: id,
            at: now,
          });
        }
        offers.push({
          buyerId: offer.buyerId,
          amountUsd: offer.amountUsd,
          thread: thread?.id ?? null,
        });
      }

      return { deals, offers };
    });
  } catch (error) {
    if (error instanceof RemoveAbort) {
      if (error.reason !== "changed")
        return { ok: false, reason: error.reason };
      // Read again to say what it changed to: a payment that reserved it is
      // a different message from a moderator who took it down.
      const after = await db.listing.findUnique({
        where: { id },
        select: { status: true },
      });
      if (after?.status === "REMOVED") {
        return { ok: true, outcome: "removed", slug: existing.slug };
      }
      const lock = after ? lockOfStatus(after.status) : null;
      return {
        ok: false,
        reason: lock && lock !== "removed" ? lock : "changed",
      };
    }
    throw error;
  }

  // Told after the commit: a notification for a closing that rolled back
  // would be a lie.
  for (const deal of closed.deals) {
    await notify({
      userId: deal.buyerId,
      kind: "ORDER",
      title: "The seller removed this listing",
      body: `Deal ${deal.reference} has closed, and the account is no longer for sale. You were not charged.`,
      href: `/dashboard/deals/${deal.orderId}`,
    });
  }
  for (const offer of closed.offers) {
    await notify({
      userId: offer.buyerId,
      kind: "OFFER",
      title: `Your offer of ${money(offer.amountUsd)} closed`,
      body: "The seller took the listing off the marketplace, so it is no longer for sale.",
      href: offer.thread
        ? `/dashboard/messages/${offer.thread}`
        : "/dashboard/offers",
    });
  }

  await recordAudit({
    actorId: sellerId,
    action: "listing.seller_remove",
    entity: "listing",
    entityId: id,
    before: { status: existing.status },
    after: {
      status: "REMOVED",
      reason: SELLER_REMOVED_REASON,
      dealsClosed: closed.deals.length,
      offersDeclined: closed.offers.length,
    },
  });

  return { ok: true, outcome: "removed", slug: existing.slug };
}

/**
 * Drops an ownership verification when the thing being verified changes.
 *
 * A verified listing can be rejected by a moderator, and a rejected listing is
 * editable — so without this a seller could get one channel verified, have the
 * listing rejected, then point it at a different channel and keep the badge,
 * because `checkOwnershipCode` short-circuits on "already verified".
 *
 * The code is cleared too, not just the flag. The old one may still be sitting
 * in the old channel's description, where it proves nothing about the new one.
 */
export async function clearVerificationIfIdentityChanged(
  sellerId: string,
  listingId: string,
  next: { sourceUrl?: string | null; handle?: string | null },
): Promise<boolean> {
  // Scoped to the seller, and scoped here rather than at the caller: this
  // runs before the caller has established who owns the listing, so an id
  // alone let any signed-in account strip the verified badge, the ownership
  // code and the channel id off any listing on the site — and be told the
  // listing could not be found, after the write.
  //
  // And only on a listing the draft form may change. Run on a live one — a
  // replayed draft save, which `updateDraft` then refuses — it stripped the
  // verified badge off a listing buyers could see, for an edit that never
  // happened.
  const listing = await db.listing.findFirst({
    where: { id: listingId, sellerId, status: { in: [...EDITABLE] } },
    select: { sourceUrl: true, handle: true, ownershipVerifiedAt: true },
  });
  if (!listing) return false;

  const normalise = (value: string | null | undefined) =>
    (value ?? "").trim().replace(/^@/, "").toLowerCase();

  const changed =
    normalise(next.sourceUrl) !== normalise(listing.sourceUrl) ||
    normalise(next.handle) !== normalise(listing.handle);

  if (!changed) return false;

  await db.listing.updateMany({
    where: { id: listingId, sellerId, status: { in: [...EDITABLE] } },
    data: {
      ownershipVerifiedAt: null,
      ownershipCode: null,
      externalId: null,
    },
  });
  return true;
}
