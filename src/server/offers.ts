import "server-only";

import type { OfferStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { TERMINAL_STATUSES } from "@/lib/deal-machine";
import { fromCents } from "@/lib/listing-form";
import {
  mentionsOffPlatform,
  type RedactionKind,
  redactContactDetails,
} from "@/lib/redact";
import { recordAudit } from "@/server/audit";
import {
  type DbWriter,
  ensureConversation,
  postEvent,
} from "@/server/chat-events";
import { notify } from "@/server/notifications";
import { getSettings } from "@/server/settings";

/**
 * Offers.
 *
 * The rule everything here exists to protect: **two buyers must never both be
 * told they can buy the same listing.** Accepting an offer is therefore a
 * compare-and-set on the listing row, not a read-then-write — see
 * `acceptOffer`.
 *
 * Every offer, and every answer to one, also leaves its mark in the
 * conversation between that buyer and the seller: a card for the offer, a
 * line for each answer. Written here, in the same transaction as the change,
 * so the thread is the record of the negotiation whichever page acted.
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
  /** The offer this one countered; null for an opening offer or price. */
  counterOf: string | null;
  /** Where its card sits, so a list can send people to the conversation. */
  conversationId: string | null;
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
  counterOf: true,
  buyer: { select: { name: true } },
  // The offer's card: every offer since the deal chat has one.
  messages: {
    where: { kind: "OFFER" as const },
    take: 1,
    select: { conversationId: true },
  },
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
  counterOf: string | null;
  buyer: { name: string };
  messages: { conversationId: string }[];
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
 * Where an offer stands right now, and whose move it is.
 *
 * An OPEN offer past its expiry is spent, whether or not anything has got
 * around to marking it. Deriving that on read means the rule holds without a
 * scheduled job, and an offer that stays acceptable because nobody swept it
 * is a real way to lose money. Shared by every place that shows an offer —
 * the Offers page, the card in the conversation, the deal panel — so none of
 * them can disagree about it.
 */
export function offerTurn(
  row: { status: OfferStatus; expiresAt: Date; bySeller: boolean },
  now = new Date(),
): { effectiveStatus: OfferStatus; awaiting: "buyer" | "seller" | null } {
  const lapsed = row.status === "OPEN" && row.expiresAt <= now;
  const effectiveStatus: OfferStatus = lapsed ? "EXPIRED" : row.status;
  return {
    effectiveStatus,
    awaiting:
      effectiveStatus !== "OPEN" ? null : row.bySeller ? "buyer" : "seller",
  };
}

function toView(row: Row, now = new Date()): OfferView {
  const turn = offerTurn(row, now);

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
    effectiveStatus: turn.effectiveStatus,
    bySeller: row.bySeller,
    message: row.message,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    respondedAt: row.respondedAt,
    buyerId: row.buyerId,
    buyerName: row.buyer.name,
    sellerId: row.listing.sellerId,
    sellerName: row.listing.seller.name,
    awaiting: turn.awaiting,
    counterOf: row.counterOf,
    conversationId: row.messages[0]?.conversationId ?? null,
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
  | "taken"
  /** A note, into a conversation Channel Adda closed. */
  | "closed"
  /** A seller's price at or above asking: the buyer can simply buy. */
  | "too-high";

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { value: T }))
  | { ok: false; reason: OfferFailure };

/** Thrown inside a transaction to roll it back with a reason attached. */
class OfferAbort extends Error {
  constructor(readonly reason: OfferFailure) {
    super(reason);
  }
}

/** Cents as a person reads them. */
function asMoney(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/** Where a notification about an offer takes somebody: the conversation. */
function threadHref(conversationId: string): string {
  return `/dashboard/messages/${conversationId}`;
}

type Note = { text: string | null; kinds: RedactionKind[]; flagged: boolean };

/**
 * An offer's note, through the same filter as a chat message.
 *
 * It used to be stored as typed, which made it the one way round the filter:
 * "call me on 017…" in an offer reached the seller untouched. It reaches the
 * conversation now, so it is treated exactly like anything else said there.
 */
function filterNote(note: string | null, handle: string): Note {
  if (!note) return { text: null, kinds: [], flagged: false };
  const { body, kinds } = redactContactDetails(note, {
    allowHandles: [handle],
  });
  return {
    text: body,
    kinds,
    flagged: kinds.length > 0 || mentionsOffPlatform(note),
  };
}

/** Raises the thread to staff when a note tried to leave the platform. */
async function flagForNote(
  w: DbWriter,
  conversationId: string,
  note: Note,
  now: Date,
) {
  if (!note.flagged) return;
  await w.conversation.update({
    where: { id: conversationId },
    data: {
      flaggedAt: now,
      flagReason: note.kinds.length
        ? `Tried to share ${note.kinds.join(", ")} in an offer`
        : "Suggested moving the conversation off Channel Adda in an offer",
    },
  });
}

/**
 * Whether a note may go into this buyer's conversation.
 *
 * Closing a conversation stops free text reaching it, from anywhere — the
 * listing page included, or the offer box would be the way round a closed
 * chat. The offer itself is not text and still goes through without one.
 */
async function noteRefused(
  listingId: string,
  buyerId: string,
  note: string | null,
): Promise<boolean> {
  if (!note) return false;
  const thread = await db.conversation.findUnique({
    where: { listingId_buyerId: { listingId, buyerId } },
    select: { closedAt: true },
  });
  return thread?.closedAt != null;
}

/** The conversation this buyer has about this listing, if any. */
async function threadOf(
  w: DbWriter,
  listingId: string,
  buyerId: string,
): Promise<string | null> {
  const thread = await w.conversation.findUnique({
    where: { listingId_buyerId: { listingId, buyerId } },
    select: { id: true },
  });
  return thread?.id ?? null;
}

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
}): Promise<Result<{ offerId: string; conversationId: string }>> {
  const listing = await db.listing.findUnique({
    where: { id: input.listingId },
    select: {
      id: true,
      status: true,
      sellerId: true,
      priceUsd: true,
      handle: true,
      title: true,
    },
  });
  if (!listing) return { ok: false, reason: "not-found" };
  if (listing.status !== "LIVE") return { ok: false, reason: "not-live" };
  if (listing.sellerId === input.buyerId) {
    return { ok: false, reason: "own-listing" };
  }
  if (input.amountCents < listing.priceUsd * MIN_OFFER_FRACTION) {
    return { ok: false, reason: "too-low" };
  }

  const note = filterNote(input.message, listing.handle);
  if (await noteRefused(listing.id, input.buyerId, note.text)) {
    return { ok: false, reason: "closed" };
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

  const buyer = await db.user.findUnique({
    where: { id: input.buyerId },
    select: { name: true },
  });

  const now = new Date();
  const { offerId, conversationId } = await db.$transaction(async (tx) => {
    // The offer is where the conversation starts when the buyer never wrote
    // first, so the seller finds it in their inbox and not only on Offers.
    const conversationId = await ensureConversation(tx, {
      listingId: listing.id,
      buyerId: input.buyerId,
      sellerId: listing.sellerId,
    });
    const offer = await tx.offer.create({
      data: {
        listingId: input.listingId,
        buyerId: input.buyerId,
        amountUsd: input.amountCents,
        message: note.text,
        bySeller: false,
        expiresAt: new Date(now.getTime() + input.expiryHours * 3_600_000),
      },
      select: { id: true },
    });
    await postEvent(tx, {
      conversationId,
      kind: "OFFER",
      event: {
        type: "offer-made",
        name: buyer?.name ?? "",
        amountCents: input.amountCents,
        bySeller: false,
      },
      senderId: input.buyerId,
      offerId: offer.id,
      at: now,
    });
    await flagForNote(tx, conversationId, note, now);
    return { offerId: offer.id, conversationId };
  });

  // The seller has to hear about it, or the offer sits until it lapses and
  // the buyer concludes nobody is home.
  const amount = asMoney(input.amountCents);
  await notify({
    userId: listing.sellerId,
    kind: "OFFER",
    title: `${buyer?.name ?? "Someone"} offered ${amount}`,
    body: `On ${listing.title || "your listing"}. You can accept it, turn it down, or come back with a number of your own.`,
    href: threadHref(conversationId),
    email: {
      subject: `${amount} offered on ${listing.title || "your listing"}`,
      body: [
        `${buyer?.name ?? "Someone"} has offered ${amount}.`,
        "",
        "You can accept it, turn it down, or counter with your own number.",
        "It lapses on its own if nobody answers.",
      ].join("\n"),
    },
  });

  return { ok: true, value: { offerId, conversationId } };
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
      buyer: { select: { name: true } },
      listing: {
        select: {
          sellerId: true,
          status: true,
          priceUsd: true,
          handle: true,
          seller: { select: { name: true } },
        },
      },
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

type Respondable = Extract<
  Awaited<ReturnType<typeof loadRespondable>>,
  { ok: true }
>["row"];

/** The name of whoever is answering, for the line in the conversation. */
function responderName(row: Respondable, as: "buyer" | "seller"): string {
  return as === "seller" ? row.listing.seller.name : row.buyer.name;
}

/**
 * Claims an open offer inside a transaction.
 *
 * The status was read before the transaction began, so two presses of the
 * same button — easy in a chat — both passed it, and a double-pressed
 * counter left two live offers on one listing. The write itself checks now.
 */
async function claimOpen(
  w: DbWriter,
  offerId: string,
  to: OfferStatus,
  now: Date,
) {
  const took = await w.offer.updateMany({
    where: { id: offerId, status: "OPEN" },
    data: { status: to, respondedAt: now },
  });
  if (took.count !== 1) throw new OfferAbort("wrong-turn");
}

/**
 * Who needs to hear about an answer to an offer.
 *
 * Whoever did not press the button. An offer can be made by either side,
 * so this is worked out from the row rather than assumed.
 */
async function tellTheOtherSide(
  row: { buyerId: string; listing: { sellerId: string } },
  responderId: string,
  conversationId: string,
  outcome: { title: string; body: string; email: boolean },
) {
  const otherId =
    responderId === row.buyerId ? row.listing.sellerId : row.buyerId;
  await notify({
    userId: otherId,
    kind: "OFFER",
    title: outcome.title,
    body: outcome.body,
    href: threadHref(conversationId),
    ...(outcome.email
      ? { email: { subject: outcome.title, body: outcome.body } }
      : {}),
  });
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
  let conversationId: string;
  let closed: { buyerId: string; amountUsd: number; thread: string | null }[];
  try {
    ({ conversationId, closed } = await db.$transaction(async (tx) => {
      const reserved = await tx.listing.updateMany({
        where: { id: row.listingId, status: "LIVE" },
        data: { status: "RESERVED" },
      });
      if (reserved.count !== 1) throw new OfferAbort("taken");

      await claimOpen(tx, offerId, "ACCEPTED", now);

      const conversationId = await ensureConversation(tx, {
        listingId: row.listingId,
        buyerId: row.buyerId,
        sellerId: row.listing.sellerId,
      });
      await postEvent(tx, {
        conversationId,
        kind: "EVENT",
        event: {
          type: "offer-accepted",
          name: responderName(row, as),
          amountCents: row.amountUsd,
        },
        senderId: responderId,
        offerId,
        at: now,
      });

      // Everyone else who was waiting hears a decision rather than nothing:
      // a line in their own conversation, and a notification below.
      const others = await tx.offer.findMany({
        where: {
          listingId: row.listingId,
          status: "OPEN",
          id: { not: offerId },
        },
        select: { id: true, buyerId: true, amountUsd: true, expiresAt: true },
      });
      const closed: {
        buyerId: string;
        amountUsd: number;
        thread: string | null;
      }[] = [];
      for (const other of others) {
        // The winning buyer's own other offers — one past its expiry that no
        // sweep has marked yet, or one raced in beside this — are not "lost
        // to another buyer". They close quietly: lapsed if the clock ran
        // out, withdrawn otherwise, because this acceptance supersedes them.
        if (other.buyerId === row.buyerId) {
          const lapsed = other.expiresAt <= now;
          await tx.offer.updateMany({
            where: { id: other.id, status: "OPEN" },
            data: lapsed
              ? { status: "EXPIRED" }
              : { status: "WITHDRAWN", respondedAt: now },
          });
          continue;
        }
        const moved = await tx.offer.updateMany({
          where: { id: other.id, status: "OPEN" },
          data: { status: "REJECTED", respondedAt: now },
        });
        if (moved.count !== 1) continue;
        const thread = await threadOf(tx, row.listingId, other.buyerId);
        if (thread) {
          await postEvent(tx, {
            conversationId: thread,
            kind: "EVENT",
            event: {
              type: "offer-auto-declined",
              amountCents: other.amountUsd,
            },
            senderId: null,
            offerId: other.id,
            at: now,
          });
        }
        closed.push({ ...other, thread });
      }
      return { conversationId, closed };
    }));
  } catch (error) {
    if (error instanceof OfferAbort) return { ok: false, reason: error.reason };
    throw error;
  }

  await tellTheOtherSide(row, responderId, conversationId, {
    title: `Your offer of ${asMoney(row.amountUsd)} was accepted`,
    body: "The listing is held for you. Open it to start the deal — it does not stay held for ever.",
    email: true,
  });
  await notifyClosedOffers(closed);

  return { ok: true };
}

/**
 * The buyers whose offers closed because someone else got the listing.
 *
 * In the bell and not by email: there is nothing for them to do, and it is
 * news rather than a request.
 */
export async function notifyClosedOffers(
  closed: { buyerId: string; amountUsd: number; thread: string | null }[],
) {
  for (const offer of closed) {
    await notify({
      userId: offer.buyerId,
      kind: "OFFER",
      title: `Your offer of ${asMoney(offer.amountUsd)} closed`,
      body: "The listing went to another buyer, so it is no longer available.",
      href: offer.thread ? threadHref(offer.thread) : "/dashboard/offers",
    });
  }
}

export async function declineOffer(
  offerId: string,
  responderId: string,
  as: "buyer" | "seller",
): Promise<Result> {
  const loaded = await loadRespondable(offerId, responderId, as);
  if (!loaded.ok) return loaded;
  const { row } = loaded;

  const now = new Date();
  let conversationId: string;
  try {
    conversationId = await db.$transaction(async (tx) => {
      await claimOpen(tx, offerId, "REJECTED", now);
      const conversationId = await ensureConversation(tx, {
        listingId: row.listingId,
        buyerId: row.buyerId,
        sellerId: row.listing.sellerId,
      });
      await postEvent(tx, {
        conversationId,
        kind: "EVENT",
        event: {
          type: "offer-declined",
          name: responderName(row, as),
          amountCents: row.amountUsd,
        },
        senderId: responderId,
        offerId,
        at: now,
      });
      return conversationId;
    });
  } catch (error) {
    if (error instanceof OfferAbort) return { ok: false, reason: error.reason };
    throw error;
  }

  await tellTheOtherSide(row, responderId, conversationId, {
    title: `Your offer of ${asMoney(row.amountUsd)} was turned down`,
    body: "Nothing is lost. You can make another one, or look at something else.",
    email: true,
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
}): Promise<Result<{ offerId: string; conversationId: string }>> {
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

  const note = filterNote(input.message, row.listing.handle);
  if (await noteRefused(row.listingId, row.buyerId, note.text)) {
    return { ok: false, reason: "closed" };
  }

  const name = responderName(row, input.as);
  const now = new Date();
  let created: { offerId: string; conversationId: string };
  try {
    created = await db.$transaction(async (tx) => {
      await claimOpen(tx, input.offerId, "COUNTERED", now);
      const offer = await tx.offer.create({
        data: {
          listingId: row.listingId,
          buyerId: row.buyerId,
          amountUsd: input.amountCents,
          message: note.text,
          bySeller: input.as === "seller",
          counterOf: input.offerId,
          expiresAt: new Date(now.getTime() + input.expiryHours * 3_600_000),
        },
        select: { id: true },
      });
      const conversationId = await ensureConversation(tx, {
        listingId: row.listingId,
        buyerId: row.buyerId,
        sellerId: row.listing.sellerId,
      });
      // The counter is its own card: it is the offer that is open now.
      await postEvent(tx, {
        conversationId,
        kind: "OFFER",
        event: { type: "countered", name, amountCents: input.amountCents },
        senderId: input.responderId,
        offerId: offer.id,
        at: now,
      });
      await flagForNote(tx, conversationId, note, now);
      return { offerId: offer.id, conversationId };
    });
  } catch (error) {
    if (error instanceof OfferAbort) return { ok: false, reason: error.reason };
    throw error;
  }

  // Nobody was told about a counter before, so a buyer whose offer had been
  // countered waited for an answer that had already arrived.
  await tellTheOtherSide(row, input.responderId, created.conversationId, {
    title: `${name || "Someone"} countered with ${asMoney(input.amountCents)}`,
    body: "Accept it, counter again, or turn it down. It lapses on its own if nobody answers.",
    email: true,
  });

  return { ok: true, value: created };
}

/**
 * A seller putting a price to a buyer who wrote to them.
 *
 * Only in a conversation the buyer started: there is no way for a seller to
 * reach a buyer who never made contact, and this is not one. It is an offer
 * like any other — stored under the buyer, `bySeller` so the buyer answers —
 * so one open offer at a time, the expiry, and accepting reserving the
 * listing all hold without a line of new code. Below the asking price only:
 * at or above it the buyer can simply buy.
 */
export async function proposePrice(input: {
  sellerId: string;
  conversationId: string;
  amountCents: number;
  message: string | null;
  expiryHours: number;
}): Promise<Result<{ offerId: string }>> {
  const thread = await db.conversation.findUnique({
    where: { id: input.conversationId },
    select: {
      id: true,
      buyerId: true,
      sellerId: true,
      closedAt: true,
      seller: { select: { name: true } },
      listing: {
        select: {
          id: true,
          status: true,
          sellerId: true,
          priceUsd: true,
          handle: true,
          title: true,
        },
      },
    },
  });
  // The thread's seller and the listing's seller are the same person; both
  // are checked so a transferred listing could not let the old one in.
  if (
    !thread ||
    thread.sellerId !== input.sellerId ||
    thread.listing.sellerId !== input.sellerId
  ) {
    return { ok: false, reason: "not-found" };
  }
  const { listing } = thread;
  if (listing.status !== "LIVE") return { ok: false, reason: "not-live" };
  if (input.amountCents >= listing.priceUsd) {
    return { ok: false, reason: "too-high" };
  }
  if (input.amountCents < listing.priceUsd * MIN_OFFER_FRACTION) {
    return { ok: false, reason: "too-low" };
  }

  const note = filterNote(input.message, listing.handle);
  if (note.text && thread.closedAt) return { ok: false, reason: "closed" };

  const open = await db.offer.findFirst({
    where: {
      listingId: listing.id,
      buyerId: thread.buyerId,
      status: "OPEN",
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  if (open) return { ok: false, reason: "already-open" };

  const now = new Date();
  const offerId = await db.$transaction(async (tx) => {
    const offer = await tx.offer.create({
      data: {
        listingId: listing.id,
        buyerId: thread.buyerId,
        amountUsd: input.amountCents,
        message: note.text,
        bySeller: true,
        expiresAt: new Date(now.getTime() + input.expiryHours * 3_600_000),
      },
      select: { id: true },
    });
    await postEvent(tx, {
      conversationId: thread.id,
      kind: "OFFER",
      event: {
        type: "offer-made",
        name: thread.seller.name,
        amountCents: input.amountCents,
        bySeller: true,
      },
      senderId: input.sellerId,
      offerId: offer.id,
      at: now,
    });
    await flagForNote(tx, thread.id, note, now);
    return offer.id;
  });

  const amount = asMoney(input.amountCents);
  const title = `${thread.seller.name || "The seller"} offered to sell for ${amount}`;
  const body = `On ${listing.title || "the listing you asked about"}. Accept it, counter, or turn it down. It lapses on its own if nobody answers.`;
  await notify({
    userId: thread.buyerId,
    kind: "OFFER",
    title,
    body,
    href: threadHref(thread.id),
    email: { subject: title, body },
  });

  return { ok: true, value: { offerId } };
}

/**
 * Pulling back an offer you made.
 *
 * Whoever made it, and only them: a buyer withdraws their own offers, a
 * seller their own prices and counters. Neither may withdraw the other's —
 * declining is how you say no to the other side, and that tells them. A
 * seller's counter is stored under the buyer's id, so "made it" is read from
 * `bySeller` and the listing, never from whose id is on the row: scoped on
 * buyerId alone, a buyer could once mark the seller's counter WITHDRAWN.
 */
export async function withdrawOffer(
  offerId: string,
  userId: string,
): Promise<Result> {
  const row = await db.offer.findUnique({
    where: { id: offerId },
    select: {
      id: true,
      status: true,
      listingId: true,
      buyerId: true,
      bySeller: true,
      amountUsd: true,
      buyer: { select: { name: true } },
      listing: {
        select: { sellerId: true, seller: { select: { name: true } } },
      },
    },
  });
  const madeIt =
    row !== null &&
    (row.bySeller ? row.listing.sellerId === userId : row.buyerId === userId);
  if (!row || !madeIt) return { ok: false, reason: "not-found" };
  if (row.status !== "OPEN") return { ok: false, reason: "wrong-turn" };

  const name = row.bySeller ? row.listing.seller.name : row.buyer.name;
  const otherId = row.bySeller ? row.buyerId : row.listing.sellerId;
  const now = new Date();
  let conversationId: string;
  try {
    conversationId = await db.$transaction(async (tx) => {
      await claimOpen(tx, offerId, "WITHDRAWN", now);
      const conversationId = await ensureConversation(tx, {
        listingId: row.listingId,
        buyerId: row.buyerId,
        sellerId: row.listing.sellerId,
      });
      await postEvent(tx, {
        conversationId,
        kind: "EVENT",
        event: {
          type: "offer-withdrawn",
          name,
          amountCents: row.amountUsd,
        },
        senderId: userId,
        offerId,
        at: now,
      });
      return conversationId;
    });
  } catch (error) {
    if (error instanceof OfferAbort) return { ok: false, reason: error.reason };
    throw error;
  }

  // The other side may have been about to answer it.
  await notify({
    userId: otherId,
    kind: "OFFER",
    title: `${name || "Someone"} withdrew their offer of ${asMoney(row.amountUsd)}`,
    body: "There is nothing to answer now.",
    href: threadHref(conversationId),
  });

  return { ok: true };
}

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
): Promise<{ id: string; amountUsd: number; heldUntil: Date } | null> {
  const { paymentWindowHours } = await getSettings();
  const windowMs = paymentWindowHours * 3_600_000;
  const since = new Date(Date.now() - windowMs);
  const held = await db.offer.findFirst({
    where: {
      listingId,
      buyerId,
      status: "ACCEPTED",
      respondedAt: { gte: since },
      order: null,
    },
    orderBy: { respondedAt: "desc" },
    select: { id: true, amountUsd: true, respondedAt: true },
  });
  if (!held?.respondedAt) return null;
  // When the hold lapses, so the people waiting on it can be told.
  return {
    id: held.id,
    amountUsd: held.amountUsd,
    heldUntil: new Date(held.respondedAt.getTime() + windowMs),
  };
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
    const now = new Date();
    const thread = await db.$transaction(async (tx) => {
      const moved = await tx.offer.updateMany({
        where: { id: offer.id, status: "ACCEPTED" },
        data: { status: "EXPIRED" },
      });
      if (moved.count !== 1) return undefined;
      const thread = await threadOf(tx, offer.listingId, offer.buyerId);
      if (thread) {
        await postEvent(tx, {
          conversationId: thread,
          kind: "EVENT",
          event: { type: "reservation-lapsed", amountCents: offer.amountUsd },
          senderId: null,
          offerId: offer.id,
          at: now,
        });
      }
      return thread;
    });
    // undefined: another sweep got there first. null: no conversation.
    if (thread === undefined) continue;

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
      href: thread ? threadHref(thread) : "/dashboard/offers",
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
 * Writes down what `offerTurn` has been deriving all along.
 *
 * Reading an expired offer as EXPIRED keeps the rule correct, but it leaves
 * the database saying OPEN for ever: the seller's dashboard count is wrong,
 * `@@index([status])` stops being selective, and any future query that trusts
 * the column is subtly broken. Now that there is a sweep to call it, the
 * derivation and the stored value agree.
 *
 * One offer at a time, so each one that lapses leaves a line in its
 * conversation. Safe to run twice at once: each offer is claimed with a
 * compare-and-set on `OPEN`, so a second pass over the same rows changes
 * nothing and writes no second line.
 */
export async function expireOffers(now = new Date()): Promise<number> {
  const due = await db.offer.findMany({
    where: { status: "OPEN", expiresAt: { lte: now } },
    select: { id: true, listingId: true, buyerId: true, amountUsd: true },
  });

  let expired = 0;
  for (const offer of due) {
    const moved = await db.$transaction(async (tx) => {
      const took = await tx.offer.updateMany({
        where: { id: offer.id, status: "OPEN", expiresAt: { lte: now } },
        // No respondedAt: the clock ran out, which is not a response. Writing
        // one here made "lapsed" and "rejected" indistinguishable in the
        // history.
        data: { status: "EXPIRED" },
      });
      if (took.count !== 1) return false;
      const thread = await threadOf(tx, offer.listingId, offer.buyerId);
      if (thread) {
        await postEvent(tx, {
          conversationId: thread,
          kind: "EVENT",
          event: { type: "offer-expired", amountCents: offer.amountUsd },
          senderId: null,
          offerId: offer.id,
          at: now,
        });
      }
      return true;
    });
    if (moved) expired += 1;
  }
  return expired;
}
