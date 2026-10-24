import "server-only";

import { db } from "@/lib/db";
import { redactContactDetails } from "@/lib/redact";
import { postEvent } from "@/server/chat-events";
import { notify } from "@/server/notifications";

/**
 * Reviews, asked for in a deal's chat once it completes: the buyer rates the
 * seller, then the buyer and the seller each rate Channel Adda.
 *
 * Every review stands on a completed deal and its author's part in it, so
 * none can be bought, written by a stranger or left twice. The words are
 * public — on the seller's page and the homepage — so contact details are
 * taken out, as they are in the chat.
 */

export const REVIEW_MAX = 500;

export type ReviewFailure = "not-allowed" | "already" | "rating" | "too-long";
export type ReviewResult = { ok: true } | { ok: false; reason: ReviewFailure };

type ReviewInput = {
  orderId: string;
  userId: string;
  rating: number;
  body: string;
};

/** "Rafi A." — a reviewer's surname is not ours to publish. */
export function shortName(name: string): string {
  const [first = "", ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0]}.` : first || "A member";
}

function checked(
  input: ReviewInput,
):
  | { ok: true; rating: number; body: string }
  | { ok: false; reason: ReviewFailure } {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    return { ok: false, reason: "rating" };
  }
  const body = input.body.trim();
  if (body.length > REVIEW_MAX) return { ok: false, reason: "too-long" };
  return {
    ok: true,
    rating: input.rating,
    body: redactContactDetails(body).body,
  };
}

const isDuplicate = (error: unknown) =>
  (error as { code?: string }).code === "P2002";

/** The buyer of a completed deal rates its seller, once. */
export async function reviewSeller(input: ReviewInput): Promise<ReviewResult> {
  const valid = checked(input);
  if (!valid.ok) return valid;

  const order = await db.order.findUnique({
    where: { id: input.orderId },
    select: {
      status: true,
      buyerId: true,
      sellerId: true,
      conversationId: true,
      reference: true,
      buyer: { select: { name: true } },
      seller: { select: { name: true, slug: true } },
    },
  });
  if (order?.status !== "COMPLETED" || order.buyerId !== input.userId) {
    return { ok: false, reason: "not-allowed" };
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.review.create({
        data: {
          orderId: input.orderId,
          authorId: order.buyerId,
          subjectId: order.sellerId,
          rating: valid.rating,
          body: valid.body,
        },
      });
      if (order.conversationId) {
        await postEvent(tx, {
          conversationId: order.conversationId,
          kind: "EVENT",
          event: {
            type: "seller-reviewed",
            name: order.buyer.name,
            seller: order.seller.name,
            rating: valid.rating,
          },
          senderId: null,
          orderId: input.orderId,
        });
      }
    });
  } catch (error) {
    if (isDuplicate(error)) return { ok: false, reason: "already" };
    throw error;
  }

  await notify({
    userId: order.sellerId,
    kind: "REVIEW",
    title: `${shortName(order.buyer.name)} gave you ${valid.rating} ${valid.rating === 1 ? "star" : "stars"}`,
    body: `For deal ${order.reference}. It shows on your public page.`,
    href: order.seller.slug ? `/seller/${order.seller.slug}` : undefined,
  });
  return { ok: true };
}

/** The buyer or the seller of a completed deal rates Channel Adda, once each. */
export async function reviewPlatform(
  input: ReviewInput,
): Promise<ReviewResult> {
  const valid = checked(input);
  if (!valid.ok) return valid;

  const order = await db.order.findUnique({
    where: { id: input.orderId },
    select: { status: true, buyerId: true, sellerId: true },
  });
  if (
    order?.status !== "COMPLETED" ||
    (order.buyerId !== input.userId && order.sellerId !== input.userId)
  ) {
    return { ok: false, reason: "not-allowed" };
  }

  try {
    await db.platformReview.create({
      data: {
        orderId: input.orderId,
        authorId: input.userId,
        rating: valid.rating,
        body: valid.body,
      },
    });
  } catch (error) {
    if (isDuplicate(error)) return { ok: false, reason: "already" };
    throw error;
  }
  return { ok: true };
}

export type ReviewPrompt = {
  orderId: string;
  viewer: "buyer" | "seller";
  /** The seller's name, for "How was Nadia?". */
  sellerName: string;
  /** The buyer's review of the seller, once left. */
  seller: { rating: number; body: string } | null;
  /** The reader's review of Channel Adda, once left. */
  platform: { rating: number; body: string } | null;
  askSeller: boolean;
  /** A buyer is asked about Channel Adda only after rating the seller. */
  askPlatform: boolean;
};

/**
 * What the chat asks this person after a completed deal, or null when it
 * asks nothing: the deal has not completed, or they were not in it.
 */
export async function reviewPromptFor(
  orderId: string,
  userId: string,
): Promise<ReviewPrompt | null> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      buyerId: true,
      sellerId: true,
      seller: { select: { name: true } },
      review: { select: { rating: true, body: true } },
      platformReviews: {
        where: { authorId: userId },
        select: { rating: true, body: true },
      },
    },
  });
  if (order?.status !== "COMPLETED") return null;
  const viewer =
    order.buyerId === userId
      ? "buyer"
      : order.sellerId === userId
        ? "seller"
        : null;
  if (!viewer) return null;

  const seller = order.review ?? null;
  const platform = order.platformReviews[0] ?? null;
  return {
    orderId,
    viewer,
    sellerName: order.seller.name,
    seller,
    platform,
    askSeller: viewer === "buyer" && seller === null,
    askPlatform: platform === null && (viewer === "seller" || seller !== null),
  };
}

export type PublicReview = {
  id: string;
  rating: number;
  body: string;
  author: string;
  createdAt: Date;
};

type Summary = {
  count: number;
  average: number | null;
  recent: PublicReview[];
};

const toPublic = (row: {
  id: string;
  rating: number;
  body: string;
  createdAt: Date;
  author: { name: string };
}): PublicReview => ({
  id: row.id,
  rating: row.rating,
  body: row.body,
  author: shortName(row.author.name),
  createdAt: row.createdAt,
});

const average = (sum: number | null, count: number) =>
  count > 0 && sum !== null ? Math.round((sum / count) * 10) / 10 : null;

/** A seller's reviews from their buyers: the count, the average, the newest. */
export async function sellerReviews(
  sellerId: string,
  take = 10,
): Promise<Summary> {
  const where = {
    subjectId: sellerId,
    order: { status: "COMPLETED" as const },
  };
  const [stats, rows] = await Promise.all([
    db.review.aggregate({ where, _count: true, _sum: { rating: true } }),
    db.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        rating: true,
        body: true,
        createdAt: true,
        author: { select: { name: true } },
      },
    }),
  ]);
  return {
    count: stats._count,
    average: average(stats._sum.rating, stats._count),
    recent: rows.map(toPublic),
  };
}

/**
 * Reviews of Channel Adda. `withWords` keeps to the ones that say something
 * and mean it as praise, for the homepage.
 */
export async function platformReviews(
  options: { take?: number; withWords?: boolean } = {},
): Promise<Summary> {
  const base = { order: { status: "COMPLETED" as const } };
  const shown = options.withWords
    ? { ...base, rating: { gte: 4 }, NOT: { body: "" } }
    : base;
  const [stats, rows] = await Promise.all([
    db.platformReview.aggregate({
      where: base,
      _count: true,
      _sum: { rating: true },
    }),
    db.platformReview.findMany({
      where: shown,
      orderBy: { createdAt: "desc" },
      take: options.take ?? 10,
      select: {
        id: true,
        rating: true,
        body: true,
        createdAt: true,
        author: { select: { name: true } },
      },
    }),
  ]);
  return {
    count: stats._count,
    average: average(stats._sum.rating, stats._count),
    recent: rows.map(toPublic),
  };
}

/** `sellerReviews`, for a public page that knows the seller by handle. */
export async function sellerReviewsBySlug(
  slug: string,
  take = 10,
): Promise<Summary> {
  const seller = await db.user.findUnique({
    where: { slug },
    select: { id: true },
  });
  return seller
    ? sellerReviews(seller.id, take)
    : { count: 0, average: null, recent: [] };
}
