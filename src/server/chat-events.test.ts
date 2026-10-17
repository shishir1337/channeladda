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
      listingId: listing.id,
      buyerId: buyer.id,
      sellerId: seller.id,
    });

    const at = new Date(Date.now() + 60_000);
    await postEvent(db, {
      conversationId: id,
      kind: "EVENT",
      event: { type: "payment-received", reference: "CA-12345" },
      senderId: null,
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
    expect(thread.lastMessageAt).toEqual(message.createdAt);
  }),
);

test(
  "a conversation made for an offer has no opening question",
  withCleanDb(async () => {
    // The canned "is it still available?" is for a buyer who has not said
    // anything yet. One who has just made an offer has said plenty.
    const { listing, buyer, seller } = await seedListing();
    const id = await ensureConversation(db, {
      listingId: listing.id,
      buyerId: buyer.id,
      sellerId: seller.id,
    });
    expect(await db.message.count({ where: { conversationId: id } })).toBe(0);

    // And asking again finds the same thread.
    expect(
      await ensureConversation(db, {
        listingId: listing.id,
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
            listingId: listing.id,
            buyerId: buyer.id,
            sellerId: seller.id,
          }),
        ),
      ]);
      if (!asked.ok) throw new Error(asked.reason);
      expect(offered).toBe(asked.id);
      expect(
        await db.conversation.count({
          where: { listingId: listing.id, buyerId: buyer.id },
        }),
      ).toBe(1);
    }
  }),
);
