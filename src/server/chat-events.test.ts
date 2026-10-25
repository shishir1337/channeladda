import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { ensureConversation, postEvent } from "@/server/chat-events";
import { openConversation } from "@/server/messages";
import { seedListing, seedUser, withCleanDb } from "@/test/db";

test(
  "an event bumps the conversation",
  withCleanDb(async () => {
    const { listing, buyer, seller } = await seedListing();
    const id = await ensureConversation(db, {
      buyerId: buyer.id,
      sellerId: seller.id,
    });

    const at = new Date(Date.now() + 60_000);
    await postEvent(db, {
      conversationId: id,
      kind: "EVENT",
      event: { type: "payment-received", reference: "CA-12345" },
      senderId: null,
      listingId: listing.id,
      at,
    });

    const [thread, message] = await Promise.all([
      db.conversation.findUniqueOrThrow({ where: { id } }),
      db.message.findFirstOrThrow({ where: { conversationId: id } }),
    ]);
    expect(message.kind).toBe("EVENT");
    expect(message.senderId).toBeNull();
    expect(message.body).toContain("CA-12345");
    expect(message.createdAt).toEqual(at);
    expect(message.listingId).toBe(listing.id);
    expect(thread.lastMessageAt).toEqual(message.createdAt);
  }),
);

test(
  "a conversation made for an offer has no opening question",
  withCleanDb(async () => {
    // The canned "is it still available?" is for a buyer who has not said
    // anything yet. One who has just made an offer has said plenty.
    const { buyer, seller } = await seedListing();
    const id = await ensureConversation(db, {
      buyerId: buyer.id,
      sellerId: seller.id,
    });
    expect(await db.message.count({ where: { conversationId: id } })).toBe(0);

    // And asking again finds the same thread.
    expect(
      await ensureConversation(db, {
        buyerId: buyer.id,
        sellerId: seller.id,
      }),
    ).toBe(id);
  }),
);

test(
  "two writers creating the same conversation end with one",
  withCleanDb(async () => {
    // "Ask the seller" and an offer from the listing page, pressed at the
    // same moment by the same buyer. Neither may fail, and there is one
    // thread afterwards. Repeated, because a race shows up some of the time.
    const { listing, seller } = await seedListing();
    for (let round = 0; round < 5; round++) {
      const buyer = await seedUser();
      const [asked, offered] = await Promise.all([
        openConversation({ listingId: listing.id, buyerId: buyer.id }),
        db.$transaction((tx) =>
          ensureConversation(tx, {
            buyerId: buyer.id,
            sellerId: seller.id,
          }),
        ),
      ]);
      if (!asked.ok) throw new Error(asked.reason);
      expect(offered).toBe(asked.id);
      expect(
        await db.conversation.count({
          where: { buyerId: buyer.id, sellerId: seller.id },
        }),
      ).toBe(1);
    }
  }),
);

test(
  "an event is about its deal's or its offer's listing, and never about nothing",
  withCleanDb(async () => {
    const { listing, buyer, seller } = await seedListing();
    const id = await ensureConversation(db, {
      buyerId: buyer.id,
      sellerId: seller.id,
    });
    const offer = await db.offer.create({
      data: {
        listingId: listing.id,
        buyerId: buyer.id,
        amountUsd: 8_000,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    await postEvent(db, {
      conversationId: id,
      kind: "EVENT",
      event: { type: "offer-expired", amountCents: 8_000 },
      senderId: null,
      offerId: offer.id,
    });
    expect(
      (await db.message.findFirstOrThrow({ where: { conversationId: id } }))
        .listingId,
    ).toBe(listing.id);

    await expect(
      postEvent(db, {
        conversationId: id,
        kind: "EVENT",
        event: { type: "hold-ended" },
        senderId: null,
      }),
    ).rejects.toThrow(/listing/);
  }),
);
