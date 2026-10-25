import "server-only";

import { db } from "@/lib/db";
import { listingsInThread } from "@/server/chat-events";
import { roleInThread } from "@/server/messages";
import { offerTurn } from "@/server/offers";
import type { CurrentUser } from "@/server/session";
import { getSettings } from "@/server/settings";
import { visibleListings } from "@/server/thread-access";

/**
 * A short string that changes whenever an open conversation should redraw.
 *
 * The page polls it every few seconds and refreshes when it moves. It is
 * built from everything the timeline and the deal panels are drawn from,
 * read at the moment of asking — not just the thread's last message,
 * because some changes write nothing in this thread: another buyer
 * reserving a listing, the seller pausing it, staff removing it, an offer
 * running out of time, a deal's hold ending. For every listing the reader
 * may see here, since a conversation is two people and may be about several.
 *
 * Null when the person may not read the thread, by the same rule as the page,
 * so the poll cannot be used to learn anything the page would not show. For
 * the agent of a deal that includes the other listings: their fingerprint is
 * built from their own deal's listing and its lines only, so it does not
 * move when something is said about another.
 */
export async function threadFingerprint(
  conversationId: string,
  viewer: CurrentUser,
  now = new Date(),
): Promise<string | null> {
  const thread = await db.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, buyerId: true, sellerId: true, lastMessageAt: true },
  });
  if (!thread || !(await roleInThread(viewer, thread))) return null;

  const only = await visibleListings(viewer, thread);
  const here = await listingsInThread(db, conversationId);
  const listingIds = only ? here.filter((id) => only.includes(id)) : here;

  const [lastLine, listings, offers, orders, settings] = await Promise.all([
    // An agent's newest line, among those they may see. Everyone else's is
    // the thread's own.
    only
      ? db.message
          .findFirst({
            where: { conversationId, listingId: { in: listingIds } },
            orderBy: { createdAt: "desc" },
            select: { createdAt: true },
          })
          .then((line) => line?.createdAt ?? null)
      : thread.lastMessageAt,
    db.listing.findMany({
      where: { id: { in: listingIds } },
      orderBy: { id: "asc" },
      select: { id: true, status: true, updatedAt: true },
    }),
    Promise.all(
      listingIds.map((listingId) =>
        db.offer.findFirst({
          where: { listingId, buyerId: thread.buyerId },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            status: true,
            expiresAt: true,
            bySeller: true,
            respondedAt: true,
          },
        }),
      ),
    ),
    db.order.findMany({
      where: { conversationId, listingId: { in: listingIds } },
      orderBy: { id: "asc" },
      select: { id: true, status: true, updatedAt: true, holdUntil: true },
    }),
    getSettings(),
  ]);

  const offerPart = offers.map((offer) => {
    if (!offer) return "-";
    // An accepted offer holds the listing for the payment window, and the
    // panel says so until it lapses — which, like an offer running out of
    // time, writes nothing anywhere.
    const heldOver =
      offer.status === "ACCEPTED" &&
      offer.respondedAt !== null &&
      offer.respondedAt.getTime() + settings.paymentWindowHours * 3_600_000 <=
        now.getTime();
    // As it reads now: an open offer past its expiry has lapsed, whether or
    // not the sweep has written that down.
    return `${offer.id}:${offerTurn(offer, now).effectiveStatus}:${heldOver ? "lapsed" : ""}`;
  });

  return [
    lastLine?.toISOString() ?? "-",
    ...listings.map(
      (listing) =>
        `${listing.id}:${listing.status}:${listing.updatedAt.toISOString()}`,
    ),
    ...offerPart,
    ...orders.map((order) =>
      [
        order.id,
        order.status,
        order.updatedAt.toISOString(),
        order.holdUntil === null
          ? "no-hold"
          : order.holdUntil <= now
            ? "hold-over"
            : "holding",
      ].join(":"),
    ),
  ].join("|");
}
