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
  /**
   * Dollars paid into the seller's wallet for Fastest sales, after our fee,
   * and how many sales. Read from the wallet's own entries, so the two can
   * never disagree.
   */
  paidToWallet: number;
  walletSales: number;
  /**
   * Dollars of seller fee taken from those sales. "After our fee" is said
   * only when one was: at a 0% seller fee it promised a deduction that
   * never happened.
   */
  sellerFeesUsd: number;
  /**
   * Dollars Safest buyers paid the seller directly — never through the
   * wallet — counted once the seller pressed Received, and how many sales.
   * One figure for both was "showing in earnings but not added in wallet"
   * (the client, 2026-10-25).
   */
  paidDirect: number;
  directSales: number;
  watching: number;
};

export async function getSellerSummary(userId: string): Promise<SellerSummary> {
  const [byStatus, toWallet, direct, watching, fees] = await Promise.all([
    db.listing.groupBy({
      by: ["status"],
      where: { sellerId: userId },
      _count: { _all: true },
    }),
    // The sale credited, less the seller fee taken from it, per deal.
    db.ledgerEntry.groupBy({
      by: ["orderId"],
      where: {
        userId,
        orderId: { not: null },
        kind: { in: ["ESCROW_RELEASE", "SELLER_FEE"] },
      },
      _sum: { amountUsd: true },
    }),
    db.order.aggregate({
      where: {
        sellerId: userId,
        mode: "SAFEST",
        sellerConfirmedAt: { not: null },
      },
      _count: { _all: true },
      _sum: { priceUsd: true },
    }),
    db.listing.aggregate({
      where: { sellerId: userId, status: "LIVE" },
      _sum: { watching: true },
    }),
    db.ledgerEntry.groupBy({
      by: ["kind"],
      where: { userId, orderId: { not: null }, kind: "SELLER_FEE" },
      _sum: { amountUsd: true },
    }),
  ]);

  const count = (status: string) =>
    byStatus.find((row) => row.status === status)?._count._all ?? 0;

  return {
    live: count("LIVE"),
    drafts: count("DRAFT"),
    inReview: count("CODE_CHECK") + count("ADMIN_REVIEW"),
    paidToWallet:
      toWallet.reduce((sum, row) => sum + (row._sum.amountUsd ?? 0), 0) / 100,
    walletSales: toWallet.length,
    sellerFeesUsd:
      -fees.reduce((sum, row) => sum + (row._sum.amountUsd ?? 0), 0) / 100,
    paidDirect: (direct._sum.priceUsd ?? 0) / 100,
    directSales: direct._count._all,
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
    // Grouped by mode, because the two count different things as paid.
    db.order.groupBy({
      by: ["mode"],
      where: { buyerId: userId, status: "COMPLETED" },
      _count: { _all: true },
      _sum: { totalUsd: true, priceUsd: true },
    }),
  ]);

  // On a Fastest deal totalUsd is everything the buyer paid. On a Safest
  // deal it is only our fee — the price went to the seller directly — so
  // summing totalUsd showed a buyer who had just completed a $10,000
  // purchase “Spent on purchases: $3”, while the seller's mirror tile read
  // $10,000 for the same deal. A completed Safest deal means the seller
  // confirmed the payment arrived, so the price counts.
  let count = 0;
  let spentCents = 0;
  for (const row of bought) {
    count += row._count._all;
    spentCents += row._sum.totalUsd ?? 0;
    if (row.mode === "SAFEST") spentCents += row._sum.priceUsd ?? 0;
  }

  return {
    openOffers,
    accepted,
    bought: count,
    spent: spentCents / 100,
  };
}
