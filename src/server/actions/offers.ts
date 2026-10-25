"use server";

import { revalidatePath } from "next/cache";
import { stripBidi } from "@/lib/bidi";
import { needsEmailVerification } from "@/lib/email-verification";
import { toCents } from "@/lib/listing-form";
import { OFFER_PROBLEM_TEXT } from "@/lib/offer-rules";
import * as repo from "@/server/offers";
import { requireUser } from "@/server/session";
import { getSettings } from "@/server/settings";

/**
 * Offers, from both sides.
 *
 * The session decides who is acting. Whether that person is the buyer or the
 * seller is worked out from the listing, never taken from the request — a
 * client that could name its own role could accept its own offers.
 */

export type OfferResult =
  /** `conversationId`: where the offer's card now sits, when one was made. */
  | { ok: true; message: string; conversationId?: string }
  | { ok: false; error: string };

const MESSAGES: Record<repo.OfferFailure, string> = {
  // The amount rules, in the same words the forms show before sending.
  ...OFFER_PROBLEM_TEXT,
  "not-found": "That offer is no longer available.",
  "not-live": "This listing is not accepting offers right now.",
  "own-listing": "You cannot make an offer on your own listing.",
  "already-open":
    "You already have an offer open on this listing. Withdraw it first.",
  expired: "That offer has expired. Ask for a fresh one.",
  "wrong-turn": "That offer has already been answered.",
  taken: "Someone else got there first — this listing is no longer available.",
  closed:
    "Channel Adda closed this conversation, so the offer can't carry a note. Send it without one.",
  "too-high":
    "At or above the asking price the buyer can simply buy. Offer less, or leave the price as it is.",
};

function fail(reason: repo.OfferFailure): OfferResult {
  return { ok: false, error: MESSAGES[reason] };
}

function refresh(slug?: string) {
  revalidatePath("/dashboard/offers");
  revalidatePath("/dashboard/listings");
  // Every offer and every answer writes into a conversation now, and the
  // inbox list shows it too: the layout, so every thread under it.
  revalidatePath("/dashboard/messages", "layout");
  if (slug) revalidatePath(`/listing/${slug}`);
  revalidatePath("/browse");
}

/** Works out whether the signed-in person is the buyer or the seller here. */
async function sideOf(userId: string, offerId: string) {
  const offer = await repo.getOfferFor(userId, offerId);
  if (!offer) return null;
  return {
    offer,
    as: offer.sellerId === userId ? ("seller" as const) : ("buyer" as const),
  };
}

export async function makeOffer(
  listingId: string,
  amount: number,
  message: string,
): Promise<OfferResult> {
  const user = await requireUser();
  if (needsEmailVerification(user)) {
    return {
      ok: false,
      error: "Confirm your email address before making an offer.",
    };
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Enter how much you are offering." };
  }

  const settings = await getSettings();
  const result = await repo.createOffer({
    buyerId: user.id,
    listingId,
    amountCents: toCents(amount),
    message: stripBidi(message).trim() || null,
    expiryHours: settings.offerExpiryHours,
  });
  if (!result.ok) return fail(result.reason);

  refresh();
  return {
    ok: true,
    message: `Offer sent. The seller has ${settings.offerExpiryHours} hours to respond.`,
    conversationId: result.value.conversationId,
  };
}

export async function acceptOffer(offerId: string): Promise<OfferResult> {
  const user = await requireUser();
  const side = await sideOf(user.id, offerId);
  if (!side) return fail("not-found");

  const result = await repo.acceptOffer(offerId, user.id, side.as);
  if (!result.ok) return fail(result.reason);

  refresh(side.offer.listingSlug);
  return {
    ok: true,
    message:
      "Accepted. The listing is reserved while the buyer pays — nobody else can buy it now.",
  };
}

export async function declineOffer(offerId: string): Promise<OfferResult> {
  const user = await requireUser();
  const side = await sideOf(user.id, offerId);
  if (!side) return fail("not-found");

  const result = await repo.declineOffer(offerId, user.id, side.as);
  if (!result.ok) return fail(result.reason);

  refresh(side.offer.listingSlug);
  return { ok: true, message: "Declined." };
}

export async function counterOffer(
  offerId: string,
  amount: number,
  message: string,
): Promise<OfferResult> {
  const user = await requireUser();
  const side = await sideOf(user.id, offerId);
  if (!side) return fail("not-found");

  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Enter a counter amount." };
  }

  const settings = await getSettings();
  const result = await repo.counterOffer({
    offerId,
    responderId: user.id,
    as: side.as,
    amountCents: toCents(amount),
    message: stripBidi(message).trim() || null,
    expiryHours: settings.offerExpiryHours,
  });
  if (!result.ok) return fail(result.reason);

  refresh(side.offer.listingSlug);
  return { ok: true, message: "Counter sent." };
}

/**
 * A seller putting a price to the buyer in one of their conversations, on
 * one of the listings it is about.
 *
 * Which conversation and listing are named by the request; whether the
 * signed-in person is its seller, and the listing one of theirs already
 * talked about there, is checked by the repository, never assumed.
 */
export async function proposePrice(
  conversationId: string,
  listingId: string,
  amount: number,
  message: string,
): Promise<OfferResult> {
  const user = await requireUser();
  if (needsEmailVerification(user)) {
    return {
      ok: false,
      error: "Confirm your email address before offering a price.",
    };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Enter the price you are offering." };
  }

  const settings = await getSettings();
  const result = await repo.proposePrice({
    sellerId: user.id,
    conversationId,
    listingId,
    amountCents: toCents(amount),
    message: stripBidi(message).trim() || null,
    expiryHours: settings.offerExpiryHours,
  });
  if (!result.ok) {
    // The shared wording speaks to a buyer. A seller with an offer waiting
    // is being asked to answer it, not to withdraw anything.
    if (result.reason === "already-open") {
      return {
        ok: false,
        error:
          "There is an offer open on this listing already. Answer that one first.",
      };
    }
    return fail(result.reason);
  }

  refresh();
  return {
    ok: true,
    message: `Price sent. The buyer has ${settings.offerExpiryHours} hours to answer.`,
    conversationId,
  };
}

export async function withdrawOffer(offerId: string): Promise<OfferResult> {
  const user = await requireUser();
  const result = await repo.withdrawOffer(offerId, user.id);
  if (!result.ok) return fail(result.reason);

  refresh();
  return { ok: true, message: "Withdrawn." };
}
