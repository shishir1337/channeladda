import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { type ChatEvent, eventText } from "@/lib/chat-events";
import { db } from "@/lib/db";

/**
 * The one way an offer or a deal writes into its conversation.
 *
 * Called by the server function that makes the change, inside that change's
 * own transaction wherever it can be, so the record is the same whichever
 * page somebody acted from and a change that rolls back takes its line with
 * it. Not a server action: nothing outside `src/server` should be able to
 * write a line that claims a payment arrived.
 */

/** A transaction client, or `db` itself for a write after a commit. */
export type DbWriter = Prisma.TransactionClient | typeof db;

/** The buyer and the seller, in that order: the direction counts. */
export type Pair = { buyerId: string; sellerId: string };

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}

/**
 * The conversation between this buyer and this seller, made if there is
 * none. One per pair, whatever listing brought them here: a buyer who comes
 * back to the same seller finds the same thread. The seller buying from the
 * buyer later is a second one — whose turn it is reads from the direction.
 *
 * Without the canned opening question `openConversation` writes: that is for
 * a buyer who has not said anything yet, and one arriving here has just made
 * an offer or opened a deal, which says plenty.
 *
 * An upsert, so a buyer pressing "Ask the seller" while an offer from the
 * listing page is being written ends with one thread, not a failed write.
 * Should two inserts still collide, the loser reads back the winner's row
 * when it can — outside a transaction. Inside one the transaction is
 * already aborted, so the error goes back to the caller, whose retry then
 * finds the thread.
 */
export async function ensureConversation(
  w: DbWriter,
  pair: Pair,
): Promise<string> {
  const where = {
    buyerId_sellerId: { buyerId: pair.buyerId, sellerId: pair.sellerId },
  };
  try {
    const row = await w.conversation.upsert({
      where,
      create: { buyerId: pair.buyerId, sellerId: pair.sellerId },
      update: {},
      select: { id: true },
    });
    return row.id;
  } catch (error) {
    if (!isUniqueViolation(error) || w !== db) throw error;
    const row = await db.conversation.findUniqueOrThrow({
      where,
      select: { id: true },
    });
    return row.id;
  }
}

/** The conversation between this buyer and this seller, if they have one. */
export async function pairThreadOf(
  w: DbWriter,
  pair: Pair,
): Promise<string | null> {
  const row = await w.conversation.findUnique({
    where: {
      buyerId_sellerId: { buyerId: pair.buyerId, sellerId: pair.sellerId },
    },
    select: { id: true },
  });
  return row?.id ?? null;
}

/**
 * Every listing a conversation is about: one somebody has written about
 * here, or one a deal here is for. A line or an offer may be about any of
 * them, and about nothing else.
 */
export async function listingsInThread(
  w: DbWriter,
  conversationId: string,
): Promise<string[]> {
  const [lines, deals] = await Promise.all([
    w.message.groupBy({ by: ["listingId"], where: { conversationId } }),
    w.order.groupBy({ by: ["listingId"], where: { conversationId } }),
  ]);
  return [...new Set([...lines, ...deals].map((row) => row.listingId))];
}

/**
 * One line in a conversation, and the conversation moved to the top.
 *
 * Every line is about one listing. A deal's line is about the deal's
 * listing and an offer's about the offer's, so either is enough to say
 * which; a caller with neither has to name it, and one that does not is a
 * bug, not a line about nothing.
 *
 * `lastMessageAt` is what orders the inbox and what the open page polls, so
 * an offer or a step that did not move it would be invisible to both.
 */
export async function postEvent(
  w: DbWriter,
  input: {
    conversationId: string;
    kind: "OFFER" | "EVENT";
    event: ChatEvent;
    /** Null for what the platform did by itself. */
    senderId: string | null;
    offerId?: string;
    orderId?: string;
    /** Read from the deal or the offer when left out. */
    listingId?: string;
    at?: Date;
  },
): Promise<void> {
  const at = input.at ?? new Date();
  const listingId = input.listingId ?? (await listingOfEvent(w, input));
  await w.message.create({
    data: {
      conversationId: input.conversationId,
      listingId,
      senderId: input.senderId,
      kind: input.kind,
      body: eventText(input.event),
      offerId: input.offerId ?? null,
      orderId: input.orderId ?? null,
      createdAt: at,
    },
  });
  await w.conversation.update({
    where: { id: input.conversationId },
    data: { lastMessageAt: at },
  });
}

async function listingOfEvent(
  w: DbWriter,
  input: { orderId?: string; offerId?: string },
): Promise<string> {
  if (input.orderId) {
    const order = await w.order.findUnique({
      where: { id: input.orderId },
      select: { listingId: true },
    });
    if (order) return order.listingId;
  }
  if (input.offerId) {
    const offer = await w.offer.findUnique({
      where: { id: input.offerId },
      select: { listingId: true },
    });
    if (offer) return offer.listingId;
  }
  throw new Error(
    "A conversation line needs the listing it is about: pass listingId, or the deal or offer it is about.",
  );
}
