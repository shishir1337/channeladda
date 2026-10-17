import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { postEvent } from "@/server/chat-events";
import { createDeal, recordOpeningPayment } from "@/server/deals";
import {
  countUnreadThreads,
  getThread,
  listStaffThreads,
  listThreads,
  openConversation,
  sendMessage,
} from "@/server/messages";
import { createOffer } from "@/server/offers";
import type { CurrentUser } from "@/server/session";
import { seedListing, withCleanDb } from "@/test/db";

/**
 * A conversation is a timeline now: what people typed, offer cards, and the
 * deal's own lines — some of which nobody sent.
 */

const HOUR = 3_600_000;

function asUser(id: string, role: CurrentUser["role"] = "USER"): CurrentUser {
  return {
    id,
    email: "someone@example.test",
    name: "Someone",
    image: null,
    emailVerified: true,
    role,
    slug: null,
    banned: false,
  };
}

async function offerOn(listingId: string, buyerId: string, note?: string) {
  const made = await createOffer({
    buyerId,
    listingId,
    amountCents: 8_000,
    message: note ?? null,
    expiryHours: 48,
  });
  if (!made.ok) throw new Error(made.reason);
  return made.value;
}

test(
  "a thread returns text, cards and events in order",
  withCleanDb(async () => {
    const { listing, buyer, seller } = await seedListing();
    const opened = await openConversation({
      listingId: listing.id,
      buyerId: buyer.id,
    });
    if (!opened.ok) throw new Error(opened.reason);
    const { offerId } = await offerOn(listing.id, buyer.id, "Best I can do.");
    await sendMessage({
      conversationId: opened.id,
      sender: asUser(seller.id),
      body: "Let me think about it.",
    });
    await postEvent(db, {
      conversationId: opened.id,
      kind: "EVENT",
      event: { type: "payment-received", reference: "CA-11111" },
      senderId: null,
    });

    const thread = await getThread(opened.id, asUser(buyer.id));
    expect(thread?.messages.map((m) => [m.kind, m.senderRole, m.mine])).toEqual(
      [
        ["TEXT", "buyer", true],
        ["OFFER", "buyer", true],
        ["TEXT", "seller", false],
        ["EVENT", "system", false],
      ],
    );

    const card = thread?.messages[1];
    expect(card?.offer).toMatchObject({
      id: offerId,
      amountCents: 8_000,
      bySeller: false,
      note: "Best I can do.",
      effectiveStatus: "OPEN",
      awaiting: "seller",
    });
    // Text and events carry no offer.
    expect(thread?.messages[0].offer).toBeNull();
    expect(thread?.messages[3].offer).toBeNull();
    expect(thread?.messages[3].senderName).toBe("Channel Adda");
  }),
);

test(
  "an offer card shows its live state",
  withCleanDb(async () => {
    const { listing, buyer } = await seedListing();
    const { offerId, conversationId } = await offerOn(listing.id, buyer.id);
    // Past its expiry, and no sweep has run.
    await db.offer.update({
      where: { id: offerId },
      data: { expiresAt: new Date(Date.now() - HOUR) },
    });

    const thread = await getThread(conversationId, asUser(buyer.id));
    expect(thread?.messages[0].offer).toMatchObject({
      effectiveStatus: "EXPIRED",
      awaiting: null,
    });
  }),
);

test(
  "every thread reader copes with a system event",
  withCleanDb(async () => {
    const { listing, buyer, seller } = await seedListing();
    const created = await createDeal({
      listingId: listing.id,
      buyerId: buyer.id,
      mode: "SAFEST",
      acceptedRevenueRisk: true,
    });
    if (!created.ok) throw new Error(created.reason);
    // The newest entry is the platform's own: nobody sent it.
    await recordOpeningPayment(
      created.orderId,
      `pay-${created.orderId}`,
      "USDT",
    );
    const order = await db.order.findUniqueOrThrow({
      where: { id: created.orderId },
    });
    const id = order.conversationId ?? "";
    const newest = await db.message.findFirstOrThrow({
      where: { conversationId: id },
      orderBy: { createdAt: "desc" },
    });
    expect(newest.senderId).toBeNull();

    expect(await getThread(id, asUser(seller.id))).not.toBeNull();

    const [row] = await listThreads(asUser(seller.id));
    expect(row.preview).toBe(newest.body);
    // The seller has the buyer's "deal opened" line to read, and nothing
    // from the system counts.
    expect(row.unread).toBe(1);
    expect(await countUnreadThreads(seller.id)).toBe(1);
    // The buyer wrote the only line a person wrote, so nothing is unread.
    expect(await countUnreadThreads(buyer.id)).toBe(0);

    const staff = await listStaffThreads();
    expect(staff[0].preview).toBe(newest.body);
  }),
);
