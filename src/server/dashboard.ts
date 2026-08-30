import "server-only";

import { db } from "@/lib/db";

/**
 * What is actually waiting on one person.
 *
 * These drive the counts in the sidebar, so the rule is strict: only things
 * that need *this* person to act. Totals and unread counts do not belong here
 * — a badge that is always lit stops meaning anything, and then the one that
 * matters gets ignored too.
 */
export type WaitingOnYou = {
  /** Offers where it is their turn to answer, on either side of a deal. */
  offers: number;
  /** Their own listings that need something doing: a code, or a fix. */
  listings: number;
};

export async function getWaitingOnYou(userId: string): Promise<WaitingOnYou> {
  const now = new Date();

  const [offersToSeller, offersToBuyer, listings] = await Promise.all([
    // Offers on their listings, made by a buyer, still live.
    db.offer.count({
      where: {
        status: "OPEN",
        bySeller: false,
        expiresAt: { gt: now },
        listing: { sellerId: userId },
      },
    }),
    // Counters sent to them as the buyer.
    db.offer.count({
      where: {
        status: "OPEN",
        bySeller: true,
        expiresAt: { gt: now },
        buyerId: userId,
      },
    }),
    // CODE_CHECK is waiting on them to place the code; REJECTED is waiting on
    // them to fix something. ADMIN_REVIEW is with us, so it is not counted.
    db.listing.count({
      where: { sellerId: userId, status: { in: ["CODE_CHECK", "REJECTED"] } },
    }),
  ]);

  return { offers: offersToSeller + offersToBuyer, listings };
}

/** What a seller's dashboard leads with. */
export type SellerSummary = {
  live: number;
  drafts: number;
  inReview: number;
  sold: number;
  /** Dollars earned from completed sales, after the platform fee. */
  earned: number;
  watching: number;
};

export async function getSellerSummary(userId: string): Promise<SellerSummary> {
  const [byStatus, sold, watching] = await Promise.all([
    db.listing.groupBy({
      by: ["status"],
      where: { sellerId: userId },
      _count: { _all: true },
    }),
    db.order.aggregate({
      where: { sellerId: userId, status: "COMPLETED" },
      _count: { _all: true },
      _sum: { priceUsd: true, sellerFeeUsd: true },
    }),
    db.listing.aggregate({
      where: { sellerId: userId, status: "LIVE" },
      _sum: { watching: true },
    }),
  ]);

  const count = (status: string) =>
    byStatus.find((row) => row.status === status)?._count._all ?? 0;

  return {
    live: count("LIVE"),
    drafts: count("DRAFT"),
    inReview: count("CODE_CHECK") + count("ADMIN_REVIEW"),
    sold: sold._count._all,
    // Paid out, not gross: what actually reached them.
    earned: ((sold._sum.priceUsd ?? 0) - (sold._sum.sellerFeeUsd ?? 0)) / 100,
    watching: watching._sum.watching ?? 0,
  };
}

/** What a buyer's dashboard leads with. */
export type BuyerSummary = {
  openOffers: number;
  accepted: number;
  bought: number;
  spent: number;
};

export async function getBuyerSummary(userId: string): Promise<BuyerSummary> {
  const now = new Date();
  const [openOffers, accepted, bought] = await Promise.all([
    db.offer.count({
      where: { buyerId: userId, status: "OPEN", expiresAt: { gt: now } },
    }),
    db.offer.count({ where: { buyerId: userId, status: "ACCEPTED" } }),
    db.order.aggregate({
      where: { buyerId: userId, status: "COMPLETED" },
      _count: { _all: true },
      _sum: { totalUsd: true },
    }),
  ]);

  return {
    openOffers,
    accepted,
    bought: bought._count._all,
    spent: (bought._sum.totalUsd ?? 0) / 100,
  };
}
