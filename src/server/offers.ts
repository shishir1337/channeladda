import "server-only";

import type { OfferStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { TERMINAL_STATUSES } from "@/lib/deal-machine";
import { recordAudit } from "@/server/audit";
import { notify } from "@/server/notifications";
import { getSettings } from "@/server/settings";
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
/** Cents as a person reads them. */
function asMoney(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
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

  // The seller has to hear about it, or the offer sits until it lapses and
  // the buyer concludes nobody is home.
  const buyer = await db.user.findUnique({
    where: { id: input.buyerId },
    select: { name: true },
  });
  const listingTitle = await db.listing.findUnique({
    where: { id: input.listingId },
    select: { title: true },
  });
  const amount = asMoney(input.amountCents);
  await notify({
    userId: listing.sellerId,
    kind: "OFFER",
    title: `${buyer?.name ?? "Someone"} offered ${amount}`,
    body: `On ${listingTitle?.title ?? "your listing"}. You can accept it, turn it down, or come back with a number of your own.`,
    href: "/dashboard/offers",
    email: {
      subject: `${amount} offered on ${listingTitle?.title ?? "your listing"}`,
      body: [
        `${buyer?.name ?? "Someone"} has offered ${amount}.`,
        "",
        "You can accept it, turn it down, or counter with your own number.",
        "It lapses on its own if nobody answers.",
      ].join("\n"),
    },
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
/**
 * Who needs to hear about an answer to an offer.
 *
 * Whoever did not press the button. An offer can be made by either side,
 * so this is worked out from the row rather than assumed.
 */
async function tellTheOtherSide(
  row: {
    id: string;
    buyerId: string;
    amountUsd: number;
    listing: { sellerId: string };
  },
  responderId: string,
  outcome: { title: string; body: string },
) {
  const otherId =
    responderId === row.buyerId ? row.listing.sellerId : row.buyerId;
  await notify({
    userId: otherId,
    kind: "OFFER",
    title: outcome.title,
    body: outcome.body,
    href: "/dashboard/offers",
    email: { subject: outcome.title, body: outcome.body },
  });
}

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

  await tellTheOtherSide(row, responderId, {
    title: `Your offer of ${asMoney(row.amountUsd)} was accepted`,
    body: "The listing is held for you. Open it to start the deal — it does not stay held for ever.",
  });

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

  await tellTheOtherSide(loaded.row, responderId, {
    title: `Your offer of ${asMoney(loaded.row.amountUsd)} was turned down`,
    body: "Nothing is lost. You can make another one, or look at something else.",
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
  // bySeller: false, because a seller's counter is stored under the buyer's
  // id. Scoped on buyerId alone, a buyer could mark the seller's counter
  // WITHDRAWN — recorded as though they had retracted their own offer, with
  // no notification — rather than declining it, which tells the seller.
  const row = await db.offer.findFirst({
    where: { id: offerId, buyerId, bySeller: false },
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
/**
 * The accepted offer a buyer holds on a listing, if it is still holding it.
 *
 * “Holding” means accepted within the payment window and not yet turned into
 * a deal. createDeal uses it to open the deal at the agreed price — which
 * it could not do before: it refused the RESERVED listing outright, so the
 * buyer who won the offer was told the listing was not accepting deals.
 */
export async function heldByAcceptedOffer(
  listingId: string,
  buyerId: string,
): Promise<{ id: string; amountUsd: number } | null> {
  const { paymentWindowHours } = await getSettings();
  const since = new Date(Date.now() - paymentWindowHours * 3_600_000);
  return db.offer.findFirst({
    where: {
      listingId,
      buyerId,
      status: "ACCEPTED",
      respondedAt: { gte: since },
      order: null,
    },
    orderBy: { respondedAt: "desc" },
    select: { id: true, amountUsd: true },
  });
}

/**
 * Accepted offers that were never turned into a deal, released.
 *
 * Accepting reserves the listing. Before this, nothing could undo that: the
 * winning buyer could not open the deal, nobody else could, the seller could
 * not pause it, and a moderator could not remove it. One click on Accept took
 * a listing off the marketplace for good.
 *
 * An acceptance now holds the listing for the payment window — the same time
 * an unpaid deal gets — and then lapses. The listing goes back on sale only if
 * no live deal is holding it; the reservation that became a deal belongs to
 * the deal now, not to the offer.
 *
 * Run by the scheduled sweep, and by createDeal for the one listing a buyer
 * is trying to open, so the next buyer is never refused by a stale hold.
 */
export async function releaseLapsedOfferReservations(
  listingId?: string,
): Promise<number> {
  const { paymentWindowHours } = await getSettings();
  const cutoff = new Date(Date.now() - paymentWindowHours * 3_600_000);

  const lapsed = await db.offer.findMany({
    where: {
      status: "ACCEPTED",
      respondedAt: { lt: cutoff },
      order: null,
      ...(listingId ? { listingId } : {}),
    },
    select: {
      id: true,
      listingId: true,
      buyerId: true,
      amountUsd: true,
      listing: { select: { sellerId: true, title: true } },
    },
  });

  let released = 0;
  for (const offer of lapsed) {
    const moved = await db.offer.updateMany({
      where: { id: offer.id, status: "ACCEPTED" },
      data: { status: "EXPIRED" },
    });
    if (moved.count !== 1) continue;

    const live = await db.order.count({
      where: {
        listingId: offer.listingId,
        status: { notIn: [...TERMINAL_STATUSES] },
      },
    });
    if (live === 0) {
      await db.listing.updateMany({
        where: { id: offer.listingId, status: "RESERVED" },
        data: { status: "LIVE" },
      });
    }

    const amount = asMoney(offer.amountUsd);
    await notify({
      userId: offer.buyerId,
      kind: "OFFER",
      title: `Your accepted offer of ${amount} lapsed`,
      body: `The deal was never opened, so ${offer.listing.title} is back on sale. You can make another offer.`,
      href: "/dashboard/offers",
    });
    await notify({
      userId: offer.listing.sellerId,
      kind: "LISTING",
      title: `${offer.listing.title} is back on sale`,
      body: `The buyer whose offer of ${amount} you accepted never opened the deal.`,
      href: "/dashboard/listings",
    });
    await recordAudit({
      actorId: null,
      action: "offer.reservation_lapsed",
      entity: "listing",
      entityId: offer.listingId,
      after: { offerId: offer.id, amountUsd: offer.amountUsd },
    });
    released += 1;
  }

  return released;
}
export async function releaseReservation(listingId: string) {
  const released = await db.listing.updateMany({
    where: { id: listingId, status: "RESERVED" },
    data: { status: "LIVE" },
  });
  return { ok: released.count === 1 };
}

/**
 * Writes down what `toView` has been deriving all along.
 *
 * Reading an expired offer as EXPIRED keeps the rule correct, but it leaves
 * the database saying OPEN for ever: the seller's dashboard count is wrong,
 * `@@index([status])` stops being selective, and any future query that trusts
 * the column is subtly broken. Now that there is a sweep to call it, the
 * derivation and the stored value agree.
 *
 * Idempotent, and safe to run twice at once: the `status: "OPEN"` predicate
 * means a second pass over the same rows changes nothing.
 */
export async function expireOffers(now = new Date()): Promise<number> {
  const { count } = await db.offer.updateMany({
    where: { status: "OPEN", expiresAt: { lte: now } },
    // No respondedAt: the clock ran out, which is not a response. Writing
    // one here made "lapsed" and "rejected" indistinguishable in the history.
    data: { status: "EXPIRED" },
  });
  return count;
}
