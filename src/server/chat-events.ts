import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { type ChatEvent, eventText } from "@/lib/chat-events";
import type { db } from "@/lib/db";

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

/**
 * The conversation for this buyer and listing, made if there is none.
 *
 * Without the canned opening question `openConversation` writes: that is for
 * a buyer who has not said anything yet, and one arriving here has just made
 * an offer or opened a deal, which says plenty.
 *
 * An upsert, so a buyer pressing "Ask the seller" while an offer from the
 * listing page is being written ends with one thread, not a failed write.
 */
export async function ensureConversation(
  w: DbWriter,
  input: { listingId: string; buyerId: string; sellerId: string },
): Promise<string> {
  const row = await w.conversation.upsert({
    where: {
      listingId_buyerId: { listingId: input.listingId, buyerId: input.buyerId },
    },
    create: {
      listingId: input.listingId,
      buyerId: input.buyerId,
      sellerId: input.sellerId,
    },
    update: {},
    select: { id: true },
  });
  return row.id;
}

/**
 * One line in a conversation, and the conversation moved to the top.
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
    at?: Date;
  },
): Promise<void> {
  const at = input.at ?? new Date();
  await w.message.create({
    data: {
      conversationId: input.conversationId,
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
