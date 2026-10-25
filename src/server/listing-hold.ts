import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { money } from "@/lib/chat-events";
import { db } from "@/lib/db";
import { TERMINAL_STATUSES } from "@/lib/deal-machine";
import { postEvent } from "@/server/chat-events";
import { notify } from "@/server/notifications";
import { getSettings } from "@/server/settings";

/**
 * Who holds a listing, and when it is taken off the market.
 *
 * Opening a deal used to reserve the listing at once, before anyone paid, so
 * one account could keep any listing off sale indefinitely by opening deals
 * and walking away (the owner, 2026-10-24). Now only two things hold one:
 *
 * - a deal that has been **paid** — the first payment wins, in the same
 *   transaction that records it, and everyone else's unpaid deal closes;
 * - a deal opened from an **offer the seller accepted**, which the seller
 *   chose, so it cannot be done to them.
 *
 * Until then the listing is on sale to everyone. One allowance: a buyer who
 * has started paying by crypto holds it for the hour their first invoice
 * lasts, so money already on its way is not beaten to it by someone else's
 * balance.
 */

type Writer = Prisma.TransactionClient | typeof db;

/** How long a crypto checkout holds a listing for the buyer paying. */
export const CRYPTO_HOLD_MS = 60 * 60 * 1000;

/** At most this many unpaid deals per buyer, so no one account can collect them. */
export const MAX_UNPAID_DEALS = 3;

/** Orders that hold their listing: paid, or opened from an accepted offer. */
export function holdingOrders(
  listingId: string,
  exceptOrderId?: string,
): Prisma.OrderWhereInput {
  return {
    listingId,
    status: { notIn: [...TERMINAL_STATUSES] },
    OR: [{ paymentRef: { not: null } }, { offerId: { not: null } }],
    ...(exceptOrderId ? { id: { not: exceptOrderId } } : {}),
  };
}

/**
 * Takes the listing for this order as its payment lands, inside the
 * payment's own transaction. False when somebody else holds it, and the
 * caller must roll the payment back.
 */
export async function claimListing(
  tx: Prisma.TransactionClient,
  order: { id: string; listingId: string; offerId: string | null },
): Promise<boolean> {
  if (order.offerId) {
    // The accepted offer reserved it already; nobody else may hold it too.
    const [listing, others] = await Promise.all([
      tx.listing.count({ where: { id: order.listingId, status: "RESERVED" } }),
      tx.order.count({ where: holdingOrders(order.listingId, order.id) }),
    ]);
    return listing === 1 && others === 0;
  }
  // Compare-and-set: of two payments at once, exactly one moves the row.
  const taken = await tx.listing.updateMany({
    where: { id: order.listingId, status: "LIVE" },
    data: { status: "RESERVED" },
  });
  return taken.count === 1;
}

/**
 * Puts a reserved listing back on sale when nothing holds it any more: no
 * paid deal still running, and no accepted offer still inside its window.
 * Every place that used to put a listing back on sale outright comes here,
 * so an unpaid deal ending can never free a listing somebody has paid for.
 */
export async function releaseIfFree(
  w: Writer,
  listingId: string,
): Promise<boolean> {
  const { paymentWindowHours } = await getSettings();
  const since = new Date(Date.now() - paymentWindowHours * 3_600_000);
  const [orders, offers] = await Promise.all([
    w.order.count({ where: holdingOrders(listingId) }),
    w.offer.count({
      where: {
        listingId,
        status: "ACCEPTED",
        order: null,
        respondedAt: { gte: since },
      },
    }),
  ]);
  if (orders > 0 || offers > 0) return false;
  const freed = await w.listing.updateMany({
    where: { id: listingId, status: "RESERVED" },
    data: { status: "LIVE" },
  });
  return freed.count === 1;
}

/**
 * Whether an unpaid deal's listing can still be paid for, asked before any
 * money moves.
 *
 * A listing reserved by nobody is put back on sale first. A deal opened
 * before 2026-10-24, when opening one reserved the listing, left it so, and
 * its own buyer pressing Pay was told another buyer had paid first (the
 * owner, 2026-10-26); an accepted offer that lapsed before its sweep ran
 * leaves one too. "held" is the seller's accepted offer to somebody else,
 * still inside its window, which can still come back. "gone" is anything
 * else: paid for by another buyer, sold, paused or removed.
 *
 * A deal from an accepted offer is always "for-sale" here: its listing is
 * reserved for it, and `claimListing` checks that hold itself.
 */
export type SaleState = "for-sale" | "held" | "gone";

export async function saleState(order: {
  listingId: string;
  offerId: string | null;
}): Promise<SaleState> {
  if (order.offerId) return "for-sale";
  const read = async () =>
    (
      await db.listing.findUnique({
        where: { id: order.listingId },
        select: { status: true },
      })
    )?.status;
  let status = await read();
  if (status === "RESERVED" && (await releaseIfFree(db, order.listingId))) {
    return "for-sale";
  }
  // Read again: another request may have freed it, or taken it, meanwhile.
  status = await read();
  if (status === "LIVE") return "for-sale";
  if (status !== "RESERVED") return "gone";
  const paid = await db.order.count({
    where: {
      listingId: order.listingId,
      status: { notIn: [...TERMINAL_STATUSES] },
      paymentRef: { not: null },
    },
  });
  return paid > 0 ? "gone" : "held";
}

const GONE = "This account is no longer for sale, so this deal has closed";

/**
 * An unpaid deal on a listing that has gone, closed when its buyer tries
 * to pay. They were told it had gone and the deal stayed open, waiting for
 * a payment it could never take. Nothing was paid, so nothing is refunded.
 */
export async function closeGoneDeal(orderId: string): Promise<void> {
  const now = new Date();
  await db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { conversationId: true },
    });
    const moved = await tx.order.updateMany({
      where: { id: orderId, status: "AWAITING_PAYMENT", paymentRef: null },
      data: { status: "CANCELLED", cancelledAt: now },
    });
    if (moved.count !== 1 || !order?.conversationId) return;
    await postEvent(tx, {
      conversationId: order.conversationId,
      kind: "EVENT",
      event: { type: "deal-ended", outcome: GONE },
      senderId: null,
      orderId,
      at: now,
    });
  });
}

export type ClosedRival = {
  orderId: string;
  buyerId: string;
  reference: string;
};

const LOST = "Another buyer paid first, so this deal has closed";

/**
 * Everyone else's unpaid deal on a listing that has just been paid for,
 * closed with a line in their own chat. Notified by `notifyRivals` after the
 * transaction commits.
 */
export async function closeRivalDeals(
  tx: Prisma.TransactionClient,
  listingId: string,
  winnerOrderId: string,
  now: Date,
): Promise<ClosedRival[]> {
  const rivals = await tx.order.findMany({
    where: {
      listingId,
      id: { not: winnerOrderId },
      status: "AWAITING_PAYMENT",
      paymentRef: null,
    },
    select: { id: true, buyerId: true, reference: true, conversationId: true },
  });
  const closed: ClosedRival[] = [];
  for (const rival of rivals) {
    const moved = await tx.order.updateMany({
      where: { id: rival.id, status: "AWAITING_PAYMENT", paymentRef: null },
      data: { status: "CANCELLED", cancelledAt: now },
    });
    if (moved.count !== 1) continue;
    if (rival.conversationId) {
      await postEvent(tx, {
        conversationId: rival.conversationId,
        kind: "EVENT",
        event: { type: "deal-ended", outcome: LOST },
        senderId: null,
        orderId: rival.id,
        at: now,
      });
    }
    closed.push({
      orderId: rival.id,
      buyerId: rival.buyerId,
      reference: rival.reference,
    });
  }
  return closed;
}

export async function notifyRivals(closed: ClosedRival[]): Promise<void> {
  for (const rival of closed) {
    await notify({
      userId: rival.buyerId,
      kind: "ORDER",
      title: "Another buyer paid first",
      body: `Deal ${rival.reference} has closed, and the account is no longer for sale. You were not charged.`,
      href: `/dashboard/deals/${rival.orderId}`,
    });
  }
}

/**
 * Whether another buyer is part-way through paying for this listing by
 * crypto: their deal's first invoice was raised less than an hour ago. Only
 * the first invoice of a deal counts, so pressing Pay again every hour does
 * not keep a listing held.
 */
export async function paymentInProgress(
  listingId: string,
  exceptOrderId: string,
): Promise<boolean> {
  const since = new Date(Date.now() - CRYPTO_HOLD_MS);
  const open = await db.order.findMany({
    where: {
      listingId,
      id: { not: exceptOrderId },
      status: "AWAITING_PAYMENT",
      paymentRef: null,
      invoices: { some: { purpose: "DEAL" } },
    },
    select: {
      invoices: {
        where: { purpose: "DEAL" },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });
  return open.some((order) => (order.invoices[0]?.createdAt ?? 0) >= since);
}

export type ClosedOffer = {
  buyerId: string;
  amountUsd: number;
  thread: string | null;
};

/**
 * Everyone still waiting on an offer for a listing that has just been paid
 * for hears a decision rather than nothing. The paying buyer's own open
 * offer is one they have superseded, so it reads as withdrawn, not declined.
 * Moved here from opening a deal: an unpaid deal must not be able to end
 * other people's offers either. Notified by `notifyClosedOffers`.
 */
export async function closeOpenOffers(
  tx: Prisma.TransactionClient,
  listingId: string,
  buyerId: string,
  now: Date,
): Promise<ClosedOffer[]> {
  const open = await tx.offer.findMany({
    where: { listingId, status: "OPEN" },
    select: {
      id: true,
      buyerId: true,
      amountUsd: true,
      listing: { select: { sellerId: true } },
    },
  });
  const closed: ClosedOffer[] = [];
  for (const other of open) {
    const own = other.buyerId === buyerId;
    const moved = await tx.offer.updateMany({
      where: { id: other.id, status: "OPEN" },
      data: { status: own ? "WITHDRAWN" : "REJECTED", respondedAt: now },
    });
    if (moved.count !== 1 || own) continue;
    const thread = await tx.conversation.findUnique({
      where: {
        buyerId_sellerId: {
          buyerId: other.buyerId,
          sellerId: other.listing.sellerId,
        },
      },
      select: { id: true },
    });
    if (thread) {
      await postEvent(tx, {
        conversationId: thread.id,
        kind: "EVENT",
        event: { type: "offer-auto-declined", amountCents: other.amountUsd },
        senderId: null,
        offerId: other.id,
        listingId,
        at: now,
      });
    }
    closed.push({
      buyerId: other.buyerId,
      amountUsd: other.amountUsd,
      thread: thread?.id ?? null,
    });
  }
  return closed;
}

/**
 * Once a payment has claimed the listing: everyone else's unpaid deal and
 * open offer closes, and they are told. Its own transaction, run after the
 * payment commits — the listing is already reserved, so none of them can be
 * paid in the meantime, and the payment's own transaction stays small.
 */
export async function settleRivals(
  listingId: string,
  winnerOrderId: string,
  buyerId: string,
): Promise<void> {
  const now = new Date();
  const { rivals, offers } = await db.$transaction(async (tx) => ({
    rivals: await closeRivalDeals(tx, listingId, winnerOrderId, now),
    offers: await closeOpenOffers(tx, listingId, buyerId, now),
  }));
  await notifyRivals(rivals);
  await notifyClosedOffers(offers);
}

/** Each buyer whose open offer closed because somebody else paid, told so. */
export async function notifyClosedOffers(closed: ClosedOffer[]) {
  for (const offer of closed) {
    await notify({
      userId: offer.buyerId,
      kind: "OFFER",
      title: `Your offer of ${money(offer.amountUsd)} closed`,
      body: "The listing went to another buyer, so it is no longer available.",
      href: offer.thread
        ? `/dashboard/messages/${offer.thread}`
        : "/dashboard/offers",
    });
  }
}
