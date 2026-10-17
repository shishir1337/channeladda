import "server-only";

import { db } from "@/lib/db";
import { roleInThread } from "@/server/messages";
import { offerTurn } from "@/server/offers";
import type { CurrentUser } from "@/server/session";

/**
 * A short string that changes whenever an open conversation should redraw.
 *
 * The page polls it every few seconds and refreshes when it moves. It is
 * built from everything the timeline and the deal panel are drawn from, read
 * at the moment of asking — not just the thread's last message, because some
 * changes write nothing in this thread: another buyer reserving the listing,
 * the seller pausing it, staff removing it, an offer running out of time, a
 * recovery hold ending.
 *
 * Null when the person may not read the thread, by the same rule as the page,
 * so the poll cannot be used to learn anything the page would not show.
 */
export async function threadFingerprint(
  conversationId: string,
  viewer: CurrentUser,
  now = new Date(),
): Promise<string | null> {
  const thread = await db.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      buyerId: true,
      sellerId: true,
      listingId: true,
      lastMessageAt: true,
      listing: { select: { status: true, updatedAt: true } },
    },
  });
  if (!thread || !(await roleInThread(viewer, thread))) return null;

  const [offer, order] = await Promise.all([
    db.offer.findFirst({
      where: { listingId: thread.listingId, buyerId: thread.buyerId },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, expiresAt: true, bySeller: true },
    }),
    db.order.findFirst({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, updatedAt: true, holdUntil: true },
    }),
  ]);

  return [
    thread.lastMessageAt.toISOString(),
    thread.listing.status,
    thread.listing.updatedAt.toISOString(),
    // As it reads now: an open offer past its expiry has lapsed, whether or
    // not the sweep has written that down.
    offer ? `${offer.id}:${offerTurn(offer, now).effectiveStatus}` : "-",
    order
      ? [
          order.id,
          order.status,
          order.updatedAt.toISOString(),
          order.holdUntil === null
            ? "no-hold"
            : order.holdUntil <= now
              ? "hold-over"
              : "holding",
        ].join(":")
      : "-",
  ].join("|");
}
