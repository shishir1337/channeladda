import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { listDisputes } from "@/server/admin-disputes";
import { purgeExpiredMedia, purgeOldMessages } from "@/server/chat-retention";
import {
  createDeal,
  expireStaleDeals,
  recordOpeningPayment,
  resolveDeal,
} from "@/server/deals";
import { openConversation } from "@/server/messages";
import { seedListing, withCleanDb } from "@/test/db";

/**
 * One conversation, more than one deal.
 *
 * A conversation is one buyer and one listing, and a deal that lapses unpaid
 * leaves the buyer free to open another in the same place. The link used to
 * live on the conversation and could hold one deal, so the second deal had no
 * conversation: the dispute desk could not find it, and the thread's media
 * was purged mid-deal because the deal it pointed at had ended.
 */

const HOUR = 3_600_000;

async function threadWithLapsedDeal() {
  const seeded = await seedListing();
  const opened = await openConversation({
    listingId: seeded.listing.id,
    buyerId: seeded.buyer.id,
  });
  if (!opened.ok) throw new Error(opened.reason);

  const first = await createDeal({
    listingId: seeded.listing.id,
    buyerId: seeded.buyer.id,
    mode: "SAFEST",
    acceptedRevenueRisk: true,
  });
  if (!first.ok) throw new Error(first.reason);

  // Past the 48-hour payment window, unpaid.
  await db.order.update({
    where: { id: first.orderId },
    data: { createdAt: new Date(Date.now() - 49 * HOUR) },
  });
  expect(await expireStaleDeals()).toBe(1);

  return { ...seeded, conversationId: opened.id, firstId: first.orderId };
}

async function openSecondDeal(listingId: string, buyerId: string) {
  const second = await createDeal({
    listingId,
    buyerId,
    mode: "SAFEST",
    acceptedRevenueRisk: true,
  });
  if (!second.ok) throw new Error(second.reason);
  return second.orderId;
}

test(
  "a second deal in the same conversation is linked to it",
  withCleanDb(async () => {
    const { listing, buyer, conversationId, firstId } =
      await threadWithLapsedDeal();
    const secondId = await openSecondDeal(listing.id, buyer.id);

    const orders = await db.order.findMany({
      where: { id: { in: [firstId, secondId] } },
      select: { conversationId: true },
    });
    expect(orders.map((o) => o.conversationId)).toEqual([
      conversationId,
      conversationId,
    ]);
  }),
);

test(
  "opening a conversation after a deal links the deal",
  withCleanDb(async () => {
    const { listing, buyer } = await seedListing();
    const created = await createDeal({
      listingId: listing.id,
      buyerId: buyer.id,
      mode: "FASTEST",
      acceptedRevenueRisk: true,
    });
    if (!created.ok) throw new Error(created.reason);

    const opened = await openConversation({
      listingId: listing.id,
      buyerId: buyer.id,
    });
    if (!opened.ok) throw new Error(opened.reason);

    const order = await db.order.findUniqueOrThrow({
      where: { id: created.orderId },
      select: { conversationId: true },
    });
    expect(order.conversationId).toBe(opened.id);
  }),
);

test(
  "a conversation with a lapsed deal keeps its media while the next deal runs",
  withCleanDb(async () => {
    const { listing, buyer, conversationId } = await threadWithLapsedDeal();
    await openSecondDeal(listing.id, buyer.id);

    await db.message.create({
      data: {
        conversationId,
        listingId: listing.id,
        senderId: buyer.id,
        body: "Receipt attached.",
        attachmentUrl: "/uploads/message/0123456789abcdef0123456789abcdef.png",
        attachmentKind: "IMAGE",
        attachmentExpiresAt: new Date(Date.now() - HOUR),
      },
    });

    // The first deal has ended; the second is still waiting to be paid.
    expect(await purgeExpiredMedia()).toBe(0);
  }),
);

test(
  "messages survive the ten-day purge once any deal exists",
  withCleanDb(async () => {
    const { listing, buyer, conversationId } = await threadWithLapsedDeal();
    await db.message.create({
      data: {
        conversationId,
        listingId: listing.id,
        senderId: buyer.id,
        body: "What we agreed.",
        createdAt: new Date(Date.now() - 11 * 24 * HOUR),
      },
    });

    expect(await purgeOldMessages()).toBe(0);
  }),
);

test(
  "the dispute desk finds the conversation of a second deal",
  withCleanDb(async () => {
    const { listing, buyer, conversationId } = await threadWithLapsedDeal();
    const secondId = await openSecondDeal(listing.id, buyer.id);
    await recordOpeningPayment(secondId, `pay-${secondId}`, "USDT");
    const raised = await resolveDeal({
      orderId: secondId,
      to: "DISPUTED",
      byUserId: buyer.id,
      note: "The seller stopped answering.",
    });
    if (!raised.ok) throw new Error(raised.reason);

    const desk = await listDisputes({ role: "MODERATOR" });
    const dispute = desk?.find((d) => d.orderId === secondId);
    expect(dispute?.conversation?.id).toBe(conversationId);
  }),
);
