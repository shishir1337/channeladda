import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { threadHref } from "@/lib/thread-href";
import { openConversation } from "@/server/messages";
import {
  createOffer,
  offerTurn,
  proposePrice,
  withdrawOffer,
} from "@/server/offers";
import { seedListing, seedUser, withCleanDb } from "@/test/db";

/**
 * A seller putting a price to a buyer, in their conversation.
 *
 * Without it, a seller who writes "I can do $90" makes the buyer type that
 * offer so the seller can accept it — two extra steps for both. It is an
 * offer like any other, so every existing rule holds: one open offer at a
 * time, the expiry, accepting reserves the listing.
 */

async function threadFor() {
  const seeded = await seedListing(); // asking $100
  const opened = await openConversation({
    listingId: seeded.listing.id,
    buyerId: seeded.buyer.id,
  });
  if (!opened.ok) throw new Error(opened.reason);
  return { ...seeded, conversationId: opened.id };
}

/** A price on the listing the conversation is about. */
const propose = async (
  sellerId: string,
  conversationId: string,
  amountCents: number,
  message: string | null = null,
) =>
  proposePrice({
    sellerId,
    conversationId,
    listingId:
      (
        await db.message.findFirst({
          where: { conversationId },
          orderBy: { createdAt: "asc" },
        })
      )?.listingId ?? "no-such-listing",
    amountCents,
    message,
    expiryHours: 48,
  });

test(
  "a seller can put a price to a buyer who wrote to them",
  withCleanDb(async () => {
    const t = await threadFor();
    const made = await propose(
      t.seller.id,
      t.conversationId,
      9_000,
      "For you.",
    );
    if (!made.ok) throw new Error(made.reason);

    const offer = await db.offer.findUniqueOrThrow({
      where: { id: made.value.offerId },
    });
    expect(offer).toMatchObject({
      buyerId: t.buyer.id,
      bySeller: true,
      counterOf: null,
      amountUsd: 9_000,
      message: "For you.",
    });
    expect(offerTurn(offer).awaiting).toBe("buyer");

    const card = await db.message.findFirstOrThrow({
      where: { conversationId: t.conversationId, kind: "OFFER" },
    });
    expect(card).toMatchObject({ offerId: offer.id, senderId: t.seller.id });

    const told = await db.notification.findFirstOrThrow({
      where: { userId: t.buyer.id, kind: "OFFER" },
    });
    expect(told.href).toBe(threadHref(t.conversationId, t.listing.id));
  }),
);

test(
  "the price must be below asking and at least half of it",
  withCleanDb(async () => {
    const t = await threadFor();
    expect(await propose(t.seller.id, t.conversationId, 10_000)).toEqual({
      ok: false,
      reason: "too-high",
    });
    expect(await propose(t.seller.id, t.conversationId, 4_999)).toEqual({
      ok: false,
      reason: "too-low",
    });
    expect((await propose(t.seller.id, t.conversationId, 5_000)).ok).toBe(true);
  }),
);

test(
  "one open offer at a time, whichever side made it",
  withCleanDb(async () => {
    const t = await threadFor();
    const theirs = await createOffer({
      buyerId: t.buyer.id,
      listingId: t.listing.id,
      amountCents: 8_000,
      message: null,
      expiryHours: 48,
    });
    if (!theirs.ok) throw new Error(theirs.reason);
    // Answer the buyer's offer instead.
    expect(await propose(t.seller.id, t.conversationId, 9_000)).toEqual({
      ok: false,
      reason: "already-open",
    });

    expect((await withdrawOffer(theirs.value.offerId, t.buyer.id)).ok).toBe(
      true,
    );
    expect((await propose(t.seller.id, t.conversationId, 9_000)).ok).toBe(true);
    // And the buyer cannot open a second one beside the seller's.
    expect(
      await createOffer({
        buyerId: t.buyer.id,
        listingId: t.listing.id,
        amountCents: 8_500,
        message: null,
        expiryHours: 48,
      }),
    ).toEqual({ ok: false, reason: "already-open" });
  }),
);

test(
  "only this conversation's seller can propose in it",
  withCleanDb(async () => {
    const t = await threadFor();
    const stranger = await seedUser();
    expect(await propose(t.buyer.id, t.conversationId, 9_000)).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(await propose(stranger.id, t.conversationId, 9_000)).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(await propose(t.seller.id, "no-such-thread", 9_000)).toEqual({
      ok: false,
      reason: "not-found",
    });
  }),
);

test(
  "the listing must be on sale",
  withCleanDb(async () => {
    const t = await threadFor();
    await db.listing.update({
      where: { id: t.listing.id },
      data: { status: "PAUSED" },
    });
    expect(await propose(t.seller.id, t.conversationId, 9_000)).toEqual({
      ok: false,
      reason: "not-live",
    });
  }),
);

test(
  "a note in a closed conversation is refused",
  withCleanDb(async () => {
    const t = await threadFor();
    await db.conversation.update({
      where: { id: t.conversationId },
      data: { closedAt: new Date() },
    });
    expect(
      await propose(t.seller.id, t.conversationId, 9_000, "Message me."),
    ).toEqual({ ok: false, reason: "closed" });
    expect((await propose(t.seller.id, t.conversationId, 9_000)).ok).toBe(true);
  }),
);

test(
  "the seller withdraws their own price, not the buyer's offer",
  withCleanDb(async () => {
    const t = await threadFor();
    const price = await propose(t.seller.id, t.conversationId, 9_000);
    if (!price.ok) throw new Error(price.reason);

    // The buyer may not withdraw the seller's price: declining it is how
    // they say no, and that tells the seller.
    expect((await withdrawOffer(price.value.offerId, t.buyer.id)).ok).toBe(
      false,
    );
    expect((await withdrawOffer(price.value.offerId, t.seller.id)).ok).toBe(
      true,
    );
    const pulled = await db.offer.findUniqueOrThrow({
      where: { id: price.value.offerId },
    });
    expect(pulled.status).toBe("WITHDRAWN");

    const offer = await createOffer({
      buyerId: t.buyer.id,
      listingId: t.listing.id,
      amountCents: 8_000,
      message: null,
      expiryHours: 48,
    });
    if (!offer.ok) throw new Error(offer.reason);
    // And the seller may not withdraw the buyer's offer.
    expect((await withdrawOffer(offer.value.offerId, t.seller.id)).ok).toBe(
      false,
    );
    expect((await withdrawOffer(offer.value.offerId, t.buyer.id)).ok).toBe(
      true,
    );
  }),
);
