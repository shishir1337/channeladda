"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  REVIEW_MAX,
  type ReviewFailure,
  reviewPlatform,
  reviewSeller,
} from "@/server/reviews";
import { requireUser } from "@/server/session";

export type ReviewActionResult = { ok: true } | { ok: false; error: string };

const MESSAGES: Record<ReviewFailure, string> = {
  "not-allowed": "Only the people in a completed deal can review it.",
  already: "You have already reviewed this.",
  rating: "Choose from one to five stars.",
  "too-long": `Keep it under ${REVIEW_MAX} characters.`,
};

/** Every page that shows this deal or its reviews. */
async function refresh(orderId: string) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { conversationId: true, seller: { select: { slug: true } } },
  });
  revalidatePath(`/dashboard/deals/${orderId}`);
  if (order?.conversationId) {
    revalidatePath(`/dashboard/messages/${order.conversationId}`);
  }
  if (order?.seller.slug) revalidatePath(`/seller/${order.seller.slug}`);
  revalidatePath("/");
}

export async function submitSellerReview(
  orderId: string,
  rating: number,
  body: string,
): Promise<ReviewActionResult> {
  const user = await requireUser();
  const result = await reviewSeller({ orderId, userId: user.id, rating, body });
  if (!result.ok) return { ok: false, error: MESSAGES[result.reason] };
  await refresh(orderId);
  return { ok: true };
}

export async function submitPlatformReview(
  orderId: string,
  rating: number,
  body: string,
): Promise<ReviewActionResult> {
  const user = await requireUser();
  const result = await reviewPlatform({
    orderId,
    userId: user.id,
    rating,
    body,
  });
  if (!result.ok) return { ok: false, error: MESSAGES[result.reason] };
  await refresh(orderId);
  return { ok: true };
}
