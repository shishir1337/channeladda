import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import { db } from "@/lib/db";
import {
  platformReviews,
  reviewPlatform,
  reviewPromptFor,
  reviewSeller,
  sellerReviews,
} from "@/server/reviews";
import { seedListing, seedUser, withCleanDb } from "@/test/db";

// The owner: once a deal completes, ask the buyer to rate the seller out of
// five, then ask for a review of Channel Adda, one after the other in the
// chat — genuine reviews, each standing on a deal that really happened.

async function seedDeal(status: "COMPLETED" | "IN_CUSTODY" = "COMPLETED") {
  const { listing, seller, buyer } = await seedListing();
  const conversation = await db.conversation.create({
    data: { listingId: listing.id, buyerId: buyer.id, sellerId: seller.id },
  });
  const order = await db.order.create({
    data: {
      reference: `CA-${randomUUID().slice(0, 6)}`,
      listingId: listing.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      conversationId: conversation.id,
      mode: "FASTEST",
      status,
      priceUsd: 6_000,
      buyerFeeUsd: 126,
      sellerFeeUsd: 0,
      totalUsd: 6_126,
      completedAt: status === "COMPLETED" ? new Date() : null,
    },
  });
  return { order, listing, seller, buyer, conversation };
}

test(
  "the buyer rates the seller once; the chat says so and the seller hears of it",
  withCleanDb(async () => {
    const { order, seller, buyer, conversation } = await seedDeal();

    expect(
      await reviewSeller({
        orderId: order.id,
        userId: buyer.id,
        rating: 5,
        body: "  Smooth handover, answered fast.  ",
      }),
    ).toEqual({ ok: true });

    expect(
      await db.review.findUniqueOrThrow({ where: { orderId: order.id } }),
    ).toMatchObject({
      authorId: buyer.id,
      subjectId: seller.id,
      rating: 5,
      body: "Smooth handover, answered fast.",
    });

    const lines = await db.message.findMany({
      where: { conversationId: conversation.id },
      select: { body: true, kind: true },
    });
    expect(lines).toContainEqual({
      kind: "EVENT",
      body: `${buyer.name} gave ${seller.name} 5 stars`,
    });
    expect(
      await db.notification.count({
        where: { userId: seller.id, kind: "REVIEW" },
      }),
    ).toBe(1);

    expect(
      await reviewSeller({
        orderId: order.id,
        userId: buyer.id,
        rating: 1,
        body: "",
      }),
    ).toEqual({ ok: false, reason: "already" });
  }),
);

test(
  "a review is kept without its direction marks",
  withCleanDb(async () => {
    const { order, buyer } = await seedDeal();
    expect(
      await reviewSeller({
        orderId: order.id,
        userId: buyer.id,
        rating: 4,
        body: "\u202BSmooth\u202C handover — شكرا",
      }),
    ).toEqual({ ok: true });
    expect(
      (await db.review.findUniqueOrThrow({ where: { orderId: order.id } }))
        .body,
    ).toBe("Smooth handover — شكرا");
  }),
);

test(
  "only the buyer of a completed deal rates its seller",
  withCleanDb(async () => {
    const { order, seller } = await seedDeal();
    const stranger = await seedUser();
    for (const userId of [seller.id, stranger.id]) {
      expect(
        await reviewSeller({ orderId: order.id, userId, rating: 5, body: "" }),
      ).toEqual({ ok: false, reason: "not-allowed" });
    }

    const running = await seedDeal("IN_CUSTODY");
    expect(
      await reviewSeller({
        orderId: running.order.id,
        userId: running.buyer.id,
        rating: 5,
        body: "",
      }),
    ).toEqual({ ok: false, reason: "not-allowed" });
  }),
);

test(
  "a rating is a whole number of stars, and a review keeps no contact details",
  withCleanDb(async () => {
    const { order, buyer } = await seedDeal();
    for (const rating of [0, 6, 4.5, Number.NaN]) {
      expect(
        await reviewSeller({
          orderId: order.id,
          userId: buyer.id,
          rating,
          body: "",
        }),
      ).toEqual({ ok: false, reason: "rating" });
    }
    expect(
      await reviewSeller({
        orderId: order.id,
        userId: buyer.id,
        rating: 4,
        body: "x".repeat(501),
      }),
    ).toEqual({ ok: false, reason: "too-long" });

    await reviewSeller({
      orderId: order.id,
      userId: buyer.id,
      rating: 4,
      body: "Good seller, write to me at rafi@example.com",
    });
    const stored = await db.review.findUniqueOrThrow({
      where: { orderId: order.id },
    });
    expect(stored.body).not.toContain("rafi@example.com");
  }),
);

test(
  "buyer and seller each review Channel Adda once; nobody else can",
  withCleanDb(async () => {
    const { order, seller, buyer } = await seedDeal();
    const stranger = await seedUser();

    for (const userId of [buyer.id, seller.id]) {
      expect(
        await reviewPlatform({
          orderId: order.id,
          userId,
          rating: 5,
          body: "Felt safe the whole way.",
        }),
      ).toEqual({ ok: true });
      expect(
        await reviewPlatform({
          orderId: order.id,
          userId,
          rating: 5,
          body: "",
        }),
      ).toEqual({ ok: false, reason: "already" });
    }
    expect(
      await reviewPlatform({
        orderId: order.id,
        userId: stranger.id,
        rating: 5,
        body: "",
      }),
    ).toEqual({ ok: false, reason: "not-allowed" });

    const summary = await platformReviews();
    expect(summary.count).toBe(2);
    expect(summary.average).toBe(5);
  }),
);

test(
  "the chat asks the buyer about the seller first, then about Channel Adda",
  withCleanDb(async () => {
    const { order, seller, buyer } = await seedDeal();

    expect(await reviewPromptFor(order.id, buyer.id)).toMatchObject({
      viewer: "buyer",
      askSeller: true,
      askPlatform: false,
      seller: null,
      platform: null,
    });

    await reviewSeller({
      orderId: order.id,
      userId: buyer.id,
      rating: 5,
      body: "",
    });
    expect(await reviewPromptFor(order.id, buyer.id)).toMatchObject({
      askSeller: false,
      askPlatform: true,
      seller: { rating: 5 },
    });

    await reviewPlatform({
      orderId: order.id,
      userId: buyer.id,
      rating: 4,
      body: "",
    });
    expect(await reviewPromptFor(order.id, buyer.id)).toMatchObject({
      askSeller: false,
      askPlatform: false,
      platform: { rating: 4 },
    });

    // The seller is asked about Channel Adda only.
    expect(await reviewPromptFor(order.id, seller.id)).toMatchObject({
      viewer: "seller",
      askSeller: false,
      askPlatform: true,
    });
  }),
);

test(
  "a deal that has not completed asks for no review",
  withCleanDb(async () => {
    const { order, buyer } = await seedDeal("IN_CUSTODY");
    expect(await reviewPromptFor(order.id, buyer.id)).toBeNull();
  }),
);

test(
  "a seller's reviews show the buyer by first name and initial",
  withCleanDb(async () => {
    const { order, seller, buyer } = await seedDeal();
    await db.user.update({
      where: { id: buyer.id },
      data: { name: "Rafi Ahmed" },
    });
    await reviewSeller({
      orderId: order.id,
      userId: buyer.id,
      rating: 5,
      body: "Great.",
    });

    const reviews = await sellerReviews(seller.id);
    expect(reviews.count).toBe(1);
    expect(reviews.average).toBe(5);
    expect(reviews.recent[0]).toMatchObject({
      rating: 5,
      body: "Great.",
      author: "Rafi A.",
    });
  }),
);
