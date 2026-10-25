import type { ListingStatus } from "@/generated/prisma/enums";

/**
 * What a seller may still do to a listing once it has been sent, and why not
 * when they may not.
 *
 * Pure, so the dashboard, the server and the tests read one set of rules and
 * one set of words.
 */

/**
 * Statuses a listing buyers can already see is edited in. A draft or a
 * returned listing is edited through the draft form instead, and one in
 * review is pulled back to a draft first.
 */
export const LIVE_EDITABLE: readonly ListingStatus[] = ["LIVE", "PAUSED"];

/**
 * Statuses the seller can take a listing away from. Not RESERVED or SOLD: a
 * buyer has paid, or has the seller's word, behind those. Not REMOVED: it is
 * gone already.
 */
export const REMOVABLE: readonly ListingStatus[] = [
  "DRAFT",
  "REJECTED",
  "CODE_CHECK",
  "ADMIN_REVIEW",
  "LIVE",
  "PAUSED",
];

/** Statuses a removal deletes outright, when nothing points at the listing. */
export const DELETABLE: readonly ListingStatus[] = ["DRAFT", "REJECTED"];

/**
 * The note a seller's own removal leaves on the listing.
 *
 * A moderator's takedown writes their reason in the same column, so this is
 * what tells the two apart on a page; the audit trail says it too, under the
 * seller's name.
 */
export const SELLER_REMOVED_REASON = "Removed by the seller.";

export function removedBySeller(listing: {
  status: ListingStatus;
  rejectionReason: string | null;
}): boolean {
  return (
    listing.status === "REMOVED" &&
    listing.rejectionReason === SELLER_REMOVED_REASON
  );
}

/** Why a listing cannot be edited or removed right now. */
export type ListingLock = "reserved" | "sold" | "removed" | "in-deal";

/** The lock a status carries on its own, before any deal is looked at. */
export function lockOfStatus(status: ListingStatus): ListingLock | null {
  if (status === "RESERVED") return "reserved";
  if (status === "SOLD") return "sold";
  if (status === "REMOVED") return "removed";
  return null;
}

const IN_DEAL = {
  title: "Locked while a deal is running",
  body: "A buyer has paid, or you accepted their offer. You can edit or remove it once that deal ends.",
};

/** The lock, in the seller's words. */
export const LOCK_TEXT: Record<ListingLock, { title: string; body: string }> = {
  reserved: IN_DEAL,
  "in-deal": IN_DEAL,
  sold: {
    title: "Sold listings cannot change",
    body: "It stays as it was, as the record of the sale.",
  },
  removed: {
    title: "This listing is off the marketplace",
    body: "Buyers cannot see it any more.",
  },
};

/**
 * The figures a moderator checked against the proof screenshots before the
 * listing went on sale. Once it is live they are the listing's word to
 * buyers, so the seller cannot change them alone: a raised follower count
 * or revenue figure went in front of buyers at once, with no review. (A
 * YouTube check also writes the channel's own subscriber count over the
 * seller's, which made that one figure Google's long before the rest.)
 */
export const VERIFIED_FACTS = [
  "audience",
  "monetized",
  "monthlyRevenue",
  "yearlyRevenue",
  "engagement",
  "ageYears",
] as const;

export type VerifiedFact = (typeof VERIFIED_FACTS)[number];

export const VERIFIED_FACTS_CHECKED =
  "These were checked when your listing was approved.";

/** Said beside them on the edit form, and when a change to one is refused. */
export const VERIFIED_FACTS_NOTE = `${VERIFIED_FACTS_CHECKED} To change them, contact support.`;
