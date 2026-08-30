import "server-only";

import type { OfferStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { fromCents } from "@/lib/listing-form";

/**
 * Offers.
 *
 * The rule everything here exists to protect: **two buyers must never both be
 * told they can buy the same listing.** Accepting an offer is therefore a
 * compare-and-set on the listing row, not a read-then-write — see
 * `acceptOffer`.
 */

/** Below this an offer is not a negotiation, it is noise. */
export const MIN_OFFER_FRACTION = 0.5;

export type OfferView = {
  id: string;
  listingId: string;
  listingSlug: string;
  listingTitle: string;
  listingHandle: string;
  listingPrice: number;
  listingCoverUrl: string;
  amount: number;
  status: OfferStatus;
  /** OPEN but past its expiry reads as EXPIRED without a scheduler. */
  effectiveStatus: OfferStatus;
  bySeller: boolean;
  message: string | null;
  expiresAt: Date;
  createdAt: Date;
  respondedAt: Date | null;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  /** Whose move it is, or null when the offer is closed. */
  awaiting: "buyer" | "seller" | null;
};

const select = {
  id: true,
  listingId: true,
  buyerId: true,
  amountUsd: true,
  status: true,
  bySeller: true,
  message: true,
  expiresAt: true,
  createdAt: true,
  respondedAt: true,
  buyer: { select: { name: true } },
  listing: {
    select: {
      slug: true,
      title: true,
      handle: true,
      priceUsd: true,
      coverUrl: true,
      sellerId: true,
      seller: { select: { name: true } },
    },
  },
} as const;

type Row = {
  id: string;
  listingId: string;
  buyerId: string;
  amountUsd: number;
  status: OfferStatus;
  bySeller: boolean;
  message: string | null;
  expiresAt: Date;
  createdAt: Date;
  respondedAt: Date | null;
  buyer: { name: string };
  listing: {
    slug: string;
    title: string;
    handle: string;
    priceUsd: number;
    coverUrl: string;
    sellerId: string;
    seller: { name: string };
  };
};

/**
 * An OPEN offer past its expiry is spent, whether or not anything has got
 * around to marking it. Deriving that on read means the rule holds without a
 * scheduled job — there is no cron in this system yet, and an offer that stays
 * acceptable because nobody swept it is a real way to lose money.
 */
function toView(row: Row, now = new Date()): OfferView {
  const lapsed = row.status === "OPEN" && row.expiresAt <= now;
  const effectiveStatus: OfferStatus = lapsed ? "EXPIRED" : row.status;

  return {
    id: row.id,
    listingId: row.listingId,
    listingSlug: row.listing.slug,
    listingTitle: row.listing.title,
    listingHandle: row.listing.handle,
    listingPrice: fromCents(row.listing.priceUsd),
    listingCoverUrl: row.listing.coverUrl,
    amount: fromCents(row.amountUsd),
    status: row.status,
    effectiveStatus,
    bySeller: row.bySeller,
    message: row.message,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    respondedAt: row.respondedAt,
    buyerId: row.buyerId,
    buyerName: row.buyer.name,
    sellerId: row.listing.sellerId,
    sellerName: row.listing.seller.name,
    awaiting:
      effectiveStatus !== "OPEN" ? null : row.bySeller ? "buyer" : "seller",
  };
}

export async function getOffersForBuyer(buyerId: string) {
  const rows = await db.offer.findMany({
    where: { buyerId },
    select,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map((row) => toView(row));
}

export async function getOffersForSeller(sellerId: string) {
  const rows = await db.offer.findMany({
    where: { listing: { sellerId } },
    select,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map((row) => toView(row));
}

export async function getOffersOnListing(listingId: string) {
  const rows = await db.offer.findMany({
    where: { listingId },
    select,
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => toView(row));
}

/** Scoped so neither side can read a negotiation they are not part of. */
export async function getOfferFor(userId: string, offerId: string) {
  const row = await db.offer.findFirst({
    where: {
      id: offerId,
      OR: [{ buyerId: userId }, { listing: { sellerId: userId } }],
    },
    select,
  });
  return row ? toView(row) : null;
}

export type OfferFailure =
  | "not-found"
  | "not-live"
  | "own-listing"
  | "too-low"
  | "already-open"
  | "expired"
  | "wrong-turn"
  | "taken";

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { value: T }))
  | { ok: false; reason: OfferFailure };

/**
 * A buyer makes an offer.
 *
 * One live offer per buyer per listing: without that, a buyer can bury a
 * seller under a hundred offers, and it becomes unclear which one accepting
 * refers to.
 */
export async function createOffer(input: {
  buyerId: string;
  listingId: string;
  amountCents: number;
  message: string | null;
  expiryHours: number;
}): Promise<Result<string>> {
  const listing = await db.listing.findUnique({
    where: { id: input.listingId },
    select: { id: true, status: true, sellerId: true, priceUsd: true },
  });
  if (!listing) return { ok: false, reason: "not-found" };
  if (listing.status !== "LIVE") return { ok: false, reason: "not-live" };
  if (listing.sellerId === input.buyerId) {
    return { ok: false, reason: "own-listing" };
  }
  if (input.amountCents < listing.priceUsd * MIN_OFFER_FRACTION) {
    return { ok: false, reason: "too-low" };
  }

  const open = await db.offer.findFirst({
    where: {
      listingId: input.listingId,
      buyerId: input.buyerId,
      status: "OPEN",
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  if (open) return { ok: false, reason: "already-open" };

  const offer = await db.offer.create({
    data: {
      listingId: input.listingId,
      buyerId: input.buyerId,
      amountUsd: input.amountCents,
      message: input.message,
      bySeller: false,
      expiresAt: new Date(Date.now() + input.expiryHours * 3_600_000),
    },
    select: { id: true },
  });
  return { ok: true, value: offer.id };
}

/** Loads an offer and checks the caller is allowed to respond to it now. */
async function loadRespondable(
  offerId: string,
  responderId: string,
  as: "buyer" | "seller",
) {
  const row = await db.offer.findUnique({
    where: { id: offerId },
    select: {
      id: true,
      listingId: true,
      buyerId: true,
      amountUsd: true,
      status: true,
      bySeller: true,
      expiresAt: true,
      listing: { select: { sellerId: true, status: true, priceUsd: true } },
    },
  });
  if (!row) return { ok: false as const, reason: "not-found" as const };

  const isSeller = row.listing.sellerId === responderId;
  const isBuyer = row.buyerId === responderId;
  if (as === "seller" ? !isSeller : !isBuyer) {
    // Not theirs to answer; indistinguishable from not existing.
    return { ok: false as const, reason: "not-found" as const };
  }

  if (row.status !== "OPEN")
    return { ok: false as const, reason: "wrong-turn" as const };
  if (row.expiresAt <= new Date())
    return { ok: false as const, reason: "expired" as const };

  // A seller answers the buyer's offers; a buyer answers the seller's counters.
  const awaitingSeller = !row.bySeller;
  if (as === "seller" ? !awaitingSeller : awaitingSeller) {
    return { ok: false as const, reason: "wrong-turn" as const };
  }

  return { ok: true as const, row };
}

/**
 * Accept, and reserve the listing.
 *
 * The listing update is a **conditional** write: it only matches while the
 * listing is still LIVE. If two sellers' tabs, or two accepts of two different
 * offers, land at the same moment, exactly one changes a row and the other
 * sees zero rows affected and is told the listing is taken. Reading the status
 * first and writing second would let both through.
 */
export async function acceptOffer(
  offerId: string,
  responderId: string,
  as: "buyer" | "seller",
): Promise<Result> {
  const loaded = await loadRespondable(offerId, responderId, as);
  if (!loaded.ok) return loaded;
  const { row } = loaded;

  if (row.listing.status !== "LIVE") return { ok: false, reason: "taken" };

  const now = new Date();
  try {
    await db.$transaction(async (tx) => {
      const reserved = await tx.listing.updateMany({
        where: { id: row.listingId, status: "LIVE" },
        data: { status: "RESERVED" },
      });
      if (reserved.count !== 1) throw new Error("listing-taken");

      await tx.offer.update({
        where: { id: offerId },
        data: { status: "ACCEPTED", respondedAt: now },
      });

      // Everyone else who was waiting hears a decision rather than nothing.
      await tx.offer.updateMany({
        where: {
          listingId: row.listingId,
          status: "OPEN",
          id: { not: offerId },
        },
        data: { status: "REJECTED", respondedAt: now },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "listing-taken") {
      return { ok: false, reason: "taken" };
    }
    throw error;
  }

  return { ok: true };
}

export async function declineOffer(
  offerId: string,
  responderId: string,
  as: "buyer" | "seller",
): Promise<Result> {
  const loaded = await loadRespondable(offerId, responderId, as);
  if (!loaded.ok) return loaded;

  await db.offer.update({
    where: { id: offerId },
    data: { status: "REJECTED", respondedAt: new Date() },
  });
  return { ok: true };
}

/**
 * Counter: close the current offer and open a new one pointing back at it, so
 * the whole negotiation stays readable as a chain.
 */
export async function counterOffer(input: {
  offerId: string;
  responderId: string;
  as: "buyer" | "seller";
  amountCents: number;
  message: string | null;
  expiryHours: number;
}): Promise<Result<string>> {
  const loaded = await loadRespondable(
    input.offerId,
    input.responderId,
    input.as,
  );
  if (!loaded.ok) return loaded;
  const { row } = loaded;

  if (row.listing.status !== "LIVE") return { ok: false, reason: "taken" };
  if (input.amountCents < row.listing.priceUsd * MIN_OFFER_FRACTION) {
    return { ok: false, reason: "too-low" };
  }

  const now = new Date();
  const created = await db.$transaction(async (tx) => {
    await tx.offer.update({
      where: { id: input.offerId },
      data: { status: "COUNTERED", respondedAt: now },
    });
    return tx.offer.create({
      data: {
        listingId: row.listingId,
        buyerId: row.buyerId,
        amountUsd: input.amountCents,
        message: input.message,
        bySeller: input.as === "seller",
        counterOf: input.offerId,
        expiresAt: new Date(now.getTime() + input.expiryHours * 3_600_000),
      },
      select: { id: true },
    });
  });

  return { ok: true, value: created.id };
}

/** The buyer pulling their own offer back. */
export async function withdrawOffer(
  offerId: string,
  buyerId: string,
): Promise<Result> {
  const row = await db.offer.findFirst({
    where: { id: offerId, buyerId },
    select: { id: true, status: true },
  });
  if (!row) return { ok: false, reason: "not-found" };
  if (row.status !== "OPEN") return { ok: false, reason: "wrong-turn" };

  await db.offer.update({
    where: { id: offerId },
    data: { status: "WITHDRAWN", respondedAt: new Date() },
  });
  return { ok: true };
}

/**
 * Releases a reservation when a deal does not go ahead.
 *
 * Not wired to anything yet — checkout is what will call it, on payment
 * timeout. It lives here because the reservation is created here and the two
 * belong together.
 */
export async function releaseReservation(listingId: string) {
  const released = await db.listing.updateMany({
    where: { id: listingId, status: "RESERVED" },
    data: { status: "LIVE" },
  });
  return { ok: released.count === 1 };
}
