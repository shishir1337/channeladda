import "server-only";

import { readDealLine } from "@/components/deals/deal-status";
import type { Prisma } from "@/generated/prisma/client";
import type {
  DealMode,
  OfferStatus,
  Platform,
  UserRole,
} from "@/generated/prisma/enums";
import { stripBidi } from "@/lib/bidi";
import { OPENING_MESSAGE } from "@/lib/chat-opening";
import { isCustodianRole } from "@/lib/custody-roles";
import { db } from "@/lib/db";
import { TERMINAL_STATUSES } from "@/lib/deal-machine";
import { MAX_MESSAGE } from "@/lib/messages";
import {
  mentionsOffPlatform,
  type RedactionKind,
  redactContactDetails,
} from "@/lib/redact";
import { threadHref } from "@/lib/thread-href";
import { writesInClosedThread } from "@/lib/thread-rules";
import { isChatAttachmentKey, keyIsVideo, urlForKey } from "@/lib/upload-keys";
import { ensureConversation, listingsInThread } from "@/server/chat-events";
import { mediaExpiryFrom } from "@/server/chat-retention";
import {
  markConversationNotificationsRead,
  notify,
} from "@/server/notifications";
import { offerTurn } from "@/server/offers";
import type { CurrentUser } from "@/server/session";
import { sizeOfUpload } from "@/server/storage";
import { escrowAgentUnread } from "@/server/support-chat";
import {
  agentListings,
  agentListingsOnThread,
  agentOnThread,
  readsWholeThread,
  runningDealsOf,
  stillAnAgent,
  visibleListings,
} from "@/server/thread-access";
import { markUploadsAttached } from "@/server/upload-access";

/**
 * Every conversation on Channel Adda.
 *
 * There is no direct buyer-to-seller channel in this product and there is no
 * function here that would create one. A conversation is one buyer and one
 * seller; every message in it is about one listing, both sides are named on
 * it, and staff can read and join any of them. Contact details are stripped
 * on the way in, so the pair cannot agree to finish the deal somewhere the
 * escrow does not reach — which is the whole point, because off-platform is
 * where the scam happens and where we can do nothing about it.
 */

export { MAX_MESSAGE };

/** How the reader is involved. `agent`: the agent of a deal running here. */
export type ThreadRole = "buyer" | "seller" | "agent" | "staff";

/**
 * Who wrote an entry. Wider than the reader's role: the deal's agent writes
 * in the thread, and the platform writes the events nobody did by hand — a
 * payment clearing, a window lapsing — with no sender at all.
 */
export type SenderRole = "buyer" | "seller" | "staff" | "agent" | "system";

/**
 * An offer card, as it stands right now.
 *
 * Read from the offer itself, never from the message that announced it, so
 * the card, the Offers page and the listing page cannot disagree about it.
 */
export type ThreadOffer = {
  id: string;
  amountCents: number;
  bySeller: boolean;
  /** Already through the contact filter. */
  note: string | null;
  effectiveStatus: OfferStatus;
  awaiting: "buyer" | "seller" | null;
  expiresAt: Date;
};

export type ThreadMessage = {
  id: string;
  /** What somebody typed, an offer card, or one line of the deal's history. */
  kind: "TEXT" | "OFFER" | "EVENT";
  /** The listing this line is about. Null in the Escrow Agent chat. */
  listingId: string | null;
  /** The first line of a deal: "opened a Safest deal". */
  opensDeal: boolean;
  body: string;
  createdAt: Date;
  mine: boolean;
  fromStaff: boolean;
  senderName: string;
  senderRole: SenderRole;
  /**
   * The sender's public page, for the buyer's or the seller's lines when
   * they have one. Null for staff, the deal's agent and the platform, and
   * for a member with no page yet.
   */
  senderHref: string | null;
  /** Set on an offer card only. */
  offer: ThreadOffer | null;
  /** What was taken out, shown to everyone so the gap is never a mystery. */
  redactedKinds: string | null;
  attachmentUrl: string | null;
  attachmentKind: "IMAGE" | "VIDEO" | null;
  attachmentExpiresAt: Date | null;
  /** True once the file has been deleted, so the gap can be explained. */
  attachmentRemoved: boolean;
  /**
   * A deal in this conversation is still running, so the file is kept
   * until every one of them has ended (`purgeExpiredMedia`) — not removed
   * on its 48-hour date, as its label used to say.
   */
  attachmentKeptForDeal?: boolean;
};

/** One listing a conversation is about. */
export type ThreadListing = {
  id: string;
  slug: string;
  title: string;
  handle: string;
  priceCents: number;
  platform: Platform;
  /** The account's own page, as the seller gave it; checked before it is linked. */
  sourceUrl: string | null;
  /**
   * Whether the listing's public page exists: on sale or reserved. A sold
   * listing's page is a 404, which the buyer who just bought it was sent to
   * from their own deal chat.
   */
  onSale: boolean;
  /** The newest deal on it in this conversation, if there is one. */
  dealReference: string | null;
};

export type Thread = {
  id: string;
  /**
   * Every listing this conversation is about that the reader may see, in
   * the order they were first talked about.
   */
  listings: ThreadListing[];
  buyerId: string;
  sellerId: string;
  buyerName: string;
  sellerName: string;
  staffName: string | null;
  /** How the person reading it is involved. */
  viewerRole: ThreadRole;
  flaggedAt: Date | null;
  flagReason: string | null;
  closedAt: Date | null;
  messages: ThreadMessage[];
};

/** A deal still running in a conversation, as its inbox row shows it. */
export type ThreadDeal = {
  reference: string;
  mode: DealMode;
  listingId: string;
};

export type ThreadSummary = {
  id: string;
  /** The listing of the newest line: what the two are talking about now. */
  latestListingTitle: string;
  /** Every listing talked about here, newest first. For the filter. */
  listingTitles: string[];
  listingHandles: string[];
  /** The other side, named for whoever is reading the list. */
  withName: string;
  /** The other side's id, when the reader is one of the two sides. */
  withId: string | null;
  /** How the reader is involved: buying, selling, or the deal's agent. */
  role: ThreadRole;
  lastMessageAt: Date;
  preview: string;
  unread: number;
  flagged: boolean;
  closed: boolean;
  /** The deals still running in this conversation, newest first. */
  deals: ThreadDeal[];
};

const STAFF_ROLES = ["MODERATOR", "FINANCE", "SUPERADMIN"];

function isStaff(user: CurrentUser) {
  return STAFF_ROLES.includes(user.role);
}

const ON_SALE = new Set(["LIVE", "RESERVED"]);

/**
 * Start talking about a listing, or pick up where it left off.
 *
 * One thread per buyer and seller. A buyer with three questions, or with
 * three of the same seller's listings in mind, should not leave the seller
 * with three threads, and staff reviewing a dispute should have one place
 * to read the whole history between the two.
 */
// What a new thread starts with; shared with the listing page, which offers
// it to the buyer to edit.
export { OPENING_MESSAGE };

export async function openConversation(input: {
  listingId: string;
  buyerId: string;
  /**
   * Write the standard opener as the buyer, the first time this listing is
   * talked about here. False when the buyer's own question follows at once,
   * through `sendMessage` — see `askSeller`.
   */
  opening?: boolean;
}): Promise<
  { ok: true; id: string } | { ok: false; reason: "not-found" | "own-listing" }
> {
  const listing = await db.listing.findUnique({
    where: { id: input.listingId },
    select: { id: true, sellerId: true, status: true },
  });
  if (!listing) return { ok: false, reason: "not-found" };
  if (listing.sellerId === input.buyerId) {
    return { ok: false, reason: "own-listing" };
  }

  // Racing double-clicks both land here. The unique pair decides, and the
  // loser reads back the row the winner made rather than failing at the user.
  const id = await ensureConversation(db, {
    buyerId: input.buyerId,
    sellerId: listing.sellerId,
  });

  // Written as the buyer, so the listing arrives in the seller's inbox as a
  // question rather than as nothing. Once per listing: the same seller's
  // next listing is new to talk about, the same one is not.
  if (input.opening !== false) {
    const talkedAbout = await db.message.findFirst({
      where: { conversationId: id, listingId: listing.id },
      select: { id: true },
    });
    if (!talkedAbout) {
      const now = new Date();
      await db.$transaction([
        db.message.create({
          data: {
            conversationId: id,
            listingId: listing.id,
            senderId: input.buyerId,
            body: OPENING_MESSAGE,
            createdAt: now,
          },
        }),
        db.conversation.update({
          where: { id },
          data: { lastMessageAt: now },
        }),
      ]);
    }
  }

  // Deals may already exist — the buyer can pay first and ask questions
  // after. Linked here so the thread is part of their record from the
  // moment it exists, rather than waiting for a sweep to notice. Every one
  // between the two of them, not the latest: each needs its conversation.
  await db.order.updateMany({
    where: {
      buyerId: input.buyerId,
      sellerId: listing.sellerId,
      conversationId: null,
    },
    data: { conversationId: id },
  });

  return { ok: true, id };
}

/**
 * A buyer asking the seller something, in their own words.
 *
 * The listing's "Ask the seller a question" used to post the standard opener
 * on one click, before the buyer could change a word of it. The question now
 * goes through `sendMessage` like any other message, so contact details are
 * filtered out of it, and it lands in the thread whether that thread is new
 * or the one they already have with this seller — about this listing.
 */
export async function askSeller(input: {
  listingId: string;
  buyer: CurrentUser;
  question: string;
}): Promise<
  | { ok: true; id: string }
  | {
      ok: false;
      reason: "not-found" | "own-listing" | SendFailure;
    }
> {
  // Checked before the thread exists, so a refused question leaves no
  // empty thread in the seller's inbox.
  const question = stripBidi(input.question).trim();
  if (!question) return { ok: false, reason: "empty" };
  if (question.length > MAX_MESSAGE) return { ok: false, reason: "too-long" };

  const opened = await openConversation({
    listingId: input.listingId,
    buyerId: input.buyer.id,
    opening: false,
  });
  if (!opened.ok) return opened;

  const sent = await sendMessage({
    conversationId: opened.id,
    listingId: input.listingId,
    sender: input.buyer,
    body: question,
    joinsListing: true,
  });
  if (!sent.ok) return { ok: false, reason: sent.reason };
  return { ok: true, id: opened.id };
}

/**
 * Read a thread, if this person is allowed to.
 *
 * Not being a participant returns null rather than an error: a stranger
 * guessing conversation ids learns nothing about which ones exist. The
 * agent of a deal reads only the lines about their deal's listing.
 */
export async function getThread(
  conversationId: string,
  viewer: CurrentUser,
): Promise<Thread | null> {
  const row = await db.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      buyerId: true,
      sellerId: true,
      flaggedAt: true,
      flagReason: true,
      closedAt: true,
      buyer: { select: { id: true, name: true } },
      seller: { select: { id: true, name: true } },
      staff: { select: { name: true } },
    },
  });
  if (!row) return null;

  const viewerRole = await roleInThread(viewer, row);
  if (!viewerRole) return null;

  const visible = await visibleListings(viewer, row);
  const only = visible ? { listingId: { in: visible } } : {};

  const [messages, deals] = await Promise.all([
    db.message.findMany({
      where: { conversationId, ...only },
      orderBy: { createdAt: "asc" },
      select: {
        attachmentUrl: true,
        attachmentKind: true,
        attachmentExpiresAt: true,
        attachmentRemovedAt: true,
        id: true,
        listingId: true,
        orderId: true,
        body: true,
        createdAt: true,
        senderId: true,
        fromStaff: true,
        redactedKinds: true,
        kind: true,
        sender: { select: { name: true, slug: true } },
        offer: {
          select: {
            id: true,
            amountUsd: true,
            bySeller: true,
            message: true,
            status: true,
            expiresAt: true,
          },
        },
      },
    }),
    db.order.findMany({
      where: { conversationId, ...only },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        mode: true,
        listingId: true,
        reference: true,
        status: true,
      },
    }),
  ]);
  // Media in a conversation with a deal still running is kept until every
  // deal in it has ended: the evidence a dispute is decided on.
  const dealRunning = deals.some(
    (deal) => !TERMINAL_STATUSES.includes(deal.status),
  );

  // In the order they were first talked about; a deal with no line about it
  // yet (one from before the deal chat) after them.
  const order = [
    ...new Set([
      ...messages.map((message) => message.listingId),
      ...[...deals].reverse().map((deal) => deal.listingId),
    ]),
  ];
  const rows = await db.listing.findMany({
    where: { id: { in: order } },
    select: {
      id: true,
      slug: true,
      title: true,
      handle: true,
      priceUsd: true,
      platform: true,
      sourceUrl: true,
      status: true,
    },
  });
  const byId = new Map(rows.map((listing) => [listing.id, listing]));
  const listings: ThreadListing[] = order.flatMap((id) => {
    const listing = byId.get(id);
    if (!listing) return [];
    return [
      {
        id: listing.id,
        slug: listing.slug,
        title: listing.title,
        handle: listing.handle,
        priceCents: listing.priceUsd,
        platform: listing.platform,
        sourceUrl: listing.sourceUrl,
        onSale: ON_SALE.has(listing.status),
        dealReference:
          deals.find((deal) => deal.listingId === id)?.reference ?? null,
      },
    ];
  });

  const now = new Date();
  // A deal's first line is the one that opened it.
  const opened = new Set<string>();
  // A deal's lines, read by this reader in the deal's own words: "made
  // you an admin" to the buyer, and a line from before each platform had
  // its words in this one's (`readDealLine`).
  const dealOf = new Map(deals.map((deal) => [deal.id, deal]));
  const lineFor = (message: (typeof messages)[number]): string => {
    const deal =
      message.kind === "EVENT" && message.orderId
        ? dealOf.get(message.orderId)
        : undefined;
    const platform = deal ? byId.get(deal.listingId)?.platform : undefined;
    if (!deal || !platform) return message.body;
    return readDealLine(message.body, {
      reader: viewerRole,
      platform,
      mode: deal.mode,
    });
  };

  return {
    id: row.id,
    listings,
    buyerId: row.buyerId,
    sellerId: row.sellerId,
    buyerName: row.buyer.name,
    sellerName: row.seller.name,
    staffName: row.staff?.name ?? null,
    viewerRole,
    flaggedAt: row.flaggedAt,
    flagReason: row.flagReason,
    closedAt: row.closedAt,
    messages: messages.map((message) => {
      const opensDeal =
        message.kind === "EVENT" &&
        message.orderId !== null &&
        !opened.has(message.orderId);
      if (message.orderId) opened.add(message.orderId);
      return {
        id: message.id,
        kind: message.kind,
        listingId: message.listingId,
        opensDeal,
        body: lineFor(message),
        createdAt: message.createdAt,
        mine: message.senderId === viewer.id,
        fromStaff: message.fromStaff,
        ...senderOf(message, row),
        offer:
          message.kind === "OFFER" && message.offer
            ? {
                id: message.offer.id,
                amountCents: message.offer.amountUsd,
                bySeller: message.offer.bySeller,
                note: message.offer.message,
                expiresAt: message.offer.expiresAt,
                ...offerTurn(message.offer, now),
              }
            : null,
        redactedKinds: message.redactedKinds,
        attachmentUrl: message.attachmentUrl,
        attachmentKind: message.attachmentKind,
        attachmentExpiresAt: message.attachmentExpiresAt,
        attachmentRemoved: message.attachmentRemovedAt !== null,
        attachmentKeptForDeal:
          dealRunning &&
          message.attachmentUrl !== null &&
          message.attachmentRemovedAt === null,
      };
    }),
  };
}

/**
 * Where an old thread's link goes now.
 *
 * Until 2026-10-27 a buyer had one thread per listing; those were merged
 * into one conversation per buyer and seller, and each old id kept as an
 * alias. A link to one — in a notification, an email, a bookmark — opens
 * the conversation it became, on the listing it was about, for somebody
 * who may read that conversation. Anyone else gets null, as for an id that
 * never existed.
 */
export async function resolveThreadAlias(
  oldId: string,
  viewer: CurrentUser,
): Promise<{ conversationId: string; listingId: string } | null> {
  const alias = await db.conversationAlias.findUnique({
    where: { id: oldId },
    select: {
      listingId: true,
      conversation: { select: { id: true, buyerId: true, sellerId: true } },
    },
  });
  if (!alias || !(await roleInThread(viewer, alias.conversation))) return null;
  return { conversationId: alias.conversation.id, listingId: alias.listingId };
}

/**
 * Who an entry is from, as the thread shows it.
 *
 * Staff speak as Channel Adda, not as a named person: a buyer should not
 * learn which moderator is reading their dispute. The platform's own events
 * have no sender and read as Channel Adda too. Anyone else who is neither
 * side is the deal's agent, the only other person who can write here.
 *
 * Only the two sides link to a public page, and only once they have one: a
 * slug is what `/seller/[slug]` looks people up by.
 */
function senderOf(
  message: {
    senderId: string | null;
    fromStaff: boolean;
    sender: { name: string; slug: string | null } | null;
  },
  row: { buyerId: string; sellerId: string },
): { senderName: string; senderRole: SenderRole; senderHref: string | null } {
  if (message.fromStaff) {
    return {
      senderName: "Channel Adda",
      senderRole: "staff",
      senderHref: null,
    };
  }
  if (message.senderId === null || message.sender === null) {
    return {
      senderName: "Channel Adda",
      senderRole: "system",
      senderHref: null,
    };
  }
  const senderRole: SenderRole =
    message.senderId === row.buyerId
      ? "buyer"
      : message.senderId === row.sellerId
        ? "seller"
        : "agent";
  const slug = senderRole === "agent" ? null : message.sender.slug;
  return {
    senderName: message.sender.name,
    senderRole,
    senderHref: slug ? `/seller/${slug}` : null,
  };
}

/**
 * How this person is involved in a thread, or null when they are not.
 *
 * Exported so everything that shows a thread — the page, the poll that keeps
 * it current — answers "may they see it?" with the same rule.
 */
export async function roleInThread(
  viewer: CurrentUser,
  row: { id: string; buyerId: string; sellerId: string },
): Promise<ThreadRole | null> {
  if (row.buyerId === viewer.id) return "buyer";
  if (row.sellerId === viewer.id) return "seller";
  // Before staff: a moderator running this thread's deal is its agent here,
  // who writes as themselves and acts on the deal, not a reader of it.
  if (
    isCustodianRole(viewer.role) &&
    (await agentOnThread(viewer.id, row.id))
  ) {
    return "agent";
  }
  if (isStaff(viewer)) return "staff";
  return null;
}

/**
 * The listings a reader is limited to in each of these threads, for the
 * ones they do not read whole: the agent of a deal there sees only their
 * deal's listing (`@/server/thread-access`). A thread they read whole is
 * absent from the map.
 */
async function limitsFor(
  viewer: { id: string; role: UserRole },
  rows: { id: string; buyerId: string; sellerId: string }[],
): Promise<Map<string, string[]>> {
  const limited = rows.filter((row) => !readsWholeThread(viewer, row));
  if (limited.length === 0) return new Map();
  const theirs = await agentListings(
    viewer.id,
    limited.map((row) => row.id),
  );
  return new Map(limited.map((row) => [row.id, theirs.get(row.id) ?? []]));
}

/**
 * How many entries in each of these threads this person has not read.
 *
 * Unread means written by somebody else — never by the reader, never by the
 * platform itself (a payment clearing is told by its own notification) —
 * after the reader's own marker, or ever when they have none, and about a
 * listing they may see. One query for the threads they read whole and one
 * for the rest: a per-thread threshold is not something Prisma's filters
 * can say, and an inbox of fifty threads should not be fifty queries.
 */
async function unreadByThread(
  userId: string,
  conversationIds: string[],
  limits: Map<string, string[]> = new Map(),
): Promise<Map<string, number>> {
  if (conversationIds.length === 0) return new Map();
  const whole = conversationIds.filter((id) => !limits.has(id));
  const pairs = [...limits].flatMap(([conversationId, listingIds]) =>
    listingIds.map((listingId) => ({ conversationId, listingId })),
  );

  const [wholeRows, limitedRows] = await Promise.all([
    whole.length === 0
      ? []
      : db.$queryRaw<{ conversationId: string; unread: number }[]>`
          SELECT m."conversationId", COUNT(*)::int AS unread
          FROM "Message" AS m
          LEFT JOIN "ConversationRead" AS r
            ON r."conversationId" = m."conversationId" AND r."userId" = ${userId}
          WHERE m."conversationId" = ANY(${whole})
            AND m."senderId" IS NOT NULL
            AND m."senderId" <> ${userId}
            AND (r."readAt" IS NULL OR m."createdAt" > r."readAt")
          GROUP BY m."conversationId"
        `,
    pairs.length === 0
      ? []
      : db.$queryRaw<{ conversationId: string; unread: number }[]>`
          SELECT m."conversationId", COUNT(*)::int AS unread
          FROM "Message" AS m
          JOIN unnest(
            ${pairs.map((pair) => pair.conversationId)}::text[],
            ${pairs.map((pair) => pair.listingId)}::text[]
          ) AS seen("conversationId", "listingId")
            ON seen."conversationId" = m."conversationId"
            AND seen."listingId" = m."listingId"
          LEFT JOIN "ConversationRead" AS r
            ON r."conversationId" = m."conversationId" AND r."userId" = ${userId}
          WHERE m."senderId" IS NOT NULL
            AND m."senderId" <> ${userId}
            AND (r."readAt" IS NULL OR m."createdAt" > r."readAt")
          GROUP BY m."conversationId"
        `,
  ]);
  return new Map(
    [...wholeRows, ...limitedRows].map((row) => [
      row.conversationId,
      row.unread,
    ]),
  );
}

type Latest = {
  body: string;
  fromStaff: boolean;
  listingId: string;
  createdAt: Date;
};

/**
 * The newest line of each thread a reader is limited in, among the lines
 * they may see: what their inbox previews and sorts by. The thread's own
 * newest line and `lastMessageAt` are about anything said there, and would
 * tell the agent of one deal that something happened in another.
 */
async function latestVisible(
  limits: Map<string, string[]>,
): Promise<Map<string, Latest>> {
  const latest = new Map<string, Latest>();
  await Promise.all(
    [...limits].map(async ([conversationId, listingIds]) => {
      const line = await db.message.findFirst({
        where: { conversationId, listingId: { in: listingIds } },
        orderBy: { createdAt: "desc" },
        select: {
          body: true,
          fromStaff: true,
          listingId: true,
          createdAt: true,
        },
      });
      if (line) latest.set(conversationId, line);
    }),
  );
  return latest;
}

/**
 * The listings each thread is about, newest line first, limited as the
 * reader is. One grouped query for every thread in the list.
 */
async function listingsByThread(
  conversationIds: string[],
  limits: Map<string, string[]>,
): Promise<Map<string, { title: string; handle: string }[]>> {
  if (conversationIds.length === 0) return new Map();
  const groups = await db.message.groupBy({
    by: ["conversationId", "listingId"],
    where: { conversationId: { in: conversationIds } },
    _max: { createdAt: true },
  });
  const seen = groups
    .filter((group) => {
      const only = limits.get(group.conversationId);
      return !only || only.includes(group.listingId);
    })
    .sort(
      (a, b) =>
        (b._max.createdAt?.getTime() ?? 0) - (a._max.createdAt?.getTime() ?? 0),
    );
  const rows = await db.listing.findMany({
    where: { id: { in: [...new Set(seen.map((group) => group.listingId))] } },
    select: { id: true, title: true, handle: true },
  });
  const byId = new Map(rows.map((listing) => [listing.id, listing]));
  const listings = new Map<string, { title: string; handle: string }[]>();
  for (const group of seen) {
    const listing = byId.get(group.listingId);
    if (!listing) continue;
    const list = listings.get(group.conversationId) ?? [];
    list.push({ title: listing.title, handle: listing.handle });
    listings.set(group.conversationId, list);
  }
  return listings;
}

function previewOf(line: { body: string; fromStaff: boolean } | undefined) {
  return line
    ? `${line.fromStaff ? "Channel Adda: " : ""}${line.body}`
    : "No messages yet.";
}

const RUNNING = { status: { notIn: [...TERMINAL_STATUSES] } };

const THREAD_ROW = {
  id: true,
  buyerId: true,
  sellerId: true,
  lastMessageAt: true,
  flaggedAt: true,
  closedAt: true,
  buyer: { select: { name: true } },
  seller: { select: { name: true } },
  messages: {
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { body: true, fromStaff: true, listingId: true, createdAt: true },
  },
  orders: {
    where: RUNNING,
    orderBy: { createdAt: "desc" },
    select: { reference: true, mode: true, listingId: true },
  },
} satisfies Prisma.ConversationSelect;

/**
 * Everything this person is part of: conversations with a deal still
 * running first, then the rest, each newest first.
 *
 * Running deals are fetched whole rather than out of the newest fifty — a
 * stalled deal is the one most worth seeing, and it is often the quietest
 * thread in the list.
 */
export async function listThreads(
  viewer: CurrentUser,
  take = 50,
): Promise<ThreadSummary[]> {
  // An agent's inbox is the conversations of the deals they are running, by
  // the same rule as reading one — re-read from the database for the same
  // reason.
  const asAgent =
    isCustodianRole(viewer.role) && (await stillAnAgent(viewer.id));

  const mine: Prisma.ConversationWhereInput = {
    OR: [
      { buyerId: viewer.id },
      { sellerId: viewer.id },
      ...(asAgent ? [{ orders: runningDealsOf(viewer.id) }] : []),
    ],
  };
  const withDeal = { orders: { some: RUNNING } };

  const [dealRows, otherRows] = await Promise.all([
    db.conversation.findMany({
      where: { AND: [mine, withDeal] },
      orderBy: { lastMessageAt: "desc" },
      select: THREAD_ROW,
    }),
    db.conversation.findMany({
      where: { AND: [mine, { NOT: withDeal }] },
      orderBy: { lastMessageAt: "desc" },
      take,
      select: THREAD_ROW,
    }),
  ]);
  const rows = [...dealRows, ...otherRows];
  const ids = rows.map((row) => row.id);
  const limits = await limitsFor(viewer, rows);
  const [unread, listings, latest] = await Promise.all([
    unreadByThread(viewer.id, ids, limits),
    listingsByThread(ids, limits),
    latestVisible(limits),
  ]);

  const summary = (row: (typeof rows)[number]): ThreadSummary => {
    const role: ThreadRole =
      row.buyerId === viewer.id
        ? "buyer"
        : row.sellerId === viewer.id
          ? "seller"
          : "agent";
    const only = limits.get(row.id);
    const newest = only ? latest.get(row.id) : row.messages[0];
    const about = listings.get(row.id) ?? [];
    return {
      id: row.id,
      latestListingTitle: about[0]?.title ?? "",
      listingTitles: about.map((listing) => listing.title),
      listingHandles: about.map((listing) => listing.handle),
      // An agent is talking to both of them.
      withName:
        role === "buyer"
          ? row.seller.name
          : role === "seller"
            ? row.buyer.name
            : `${row.buyer.name} and ${row.seller.name}`,
      withId:
        role === "buyer"
          ? row.sellerId
          : role === "seller"
            ? row.buyerId
            : null,
      role,
      lastMessageAt: only
        ? (newest?.createdAt ?? row.lastMessageAt)
        : row.lastMessageAt,
      preview: previewOf(newest),
      unread: unread.get(row.id) ?? 0,
      flagged: row.flaggedAt !== null,
      closed: row.closedAt !== null,
      deals: row.orders.filter(
        (deal) => !only || only.includes(deal.listingId),
      ),
    };
  };
  // Within each group, newest first by what this reader can see.
  const byTime = (a: ThreadSummary, b: ThreadSummary) =>
    b.lastMessageAt.getTime() - a.lastMessageAt.getTime();
  return [
    ...dealRows.map(summary).sort(byTime),
    ...otherRows.map(summary).sort(byTime),
  ];
}

/**
 * How many threads are waiting on this person. Drives the sidebar badge, the
 * phone's tab bar and the website's (`/api/waiting`), so all three agree.
 * The Escrow Agent chat counts as one more when a reply is unread.
 */
export async function countUnreadThreads(userId: string): Promise<number> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, bannedAt: true },
  });
  if (!user) return 0;
  const asAgent = isCustodianRole(user.role) && !user.bannedAt;
  const [threads, escrowAgent] = await Promise.all([
    db.conversation.findMany({
      where: {
        OR: [
          { buyerId: userId },
          { sellerId: userId },
          ...(asAgent ? [{ orders: runningDealsOf(userId) }] : []),
        ],
      },
      select: { id: true, buyerId: true, sellerId: true },
    }),
    escrowAgentUnread(userId),
  ]);
  const limits = await limitsFor({ id: userId, role: user.role }, threads);
  const unread = await unreadByThread(
    userId,
    threads.map((row) => row.id),
    limits,
  );
  return (
    [...unread.values()].filter((n) => n > 0).length + (escrowAgent > 0 ? 1 : 0)
  );
}

// The staff queue has its own order (flagged first), and staff are neither
// side and no deal's agent.
export type StaffThread = Omit<ThreadSummary, "deals" | "withId" | "role"> & {
  buyerName: string;
  sellerName: string;
  flagReason: string | null;
  staffName: string | null;
};

/** The staff queue. Flagged threads first, because those are the reason it exists. */
export async function listStaffThreads(
  input: { flaggedOnly?: boolean; take?: number } = {},
): Promise<StaffThread[]> {
  const rows = await db.conversation.findMany({
    where: input.flaggedOnly ? { flaggedAt: { not: null } } : {},
    orderBy: [
      { flaggedAt: { sort: "desc", nulls: "last" } },
      { lastMessageAt: "desc" },
    ],
    take: input.take ?? 50,
    select: {
      id: true,
      lastMessageAt: true,
      flaggedAt: true,
      flagReason: true,
      closedAt: true,
      buyer: { select: { name: true } },
      seller: { select: { name: true } },
      staff: { select: { name: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, fromStaff: true },
      },
    },
  });
  const listings = await listingsByThread(
    rows.map((row) => row.id),
    new Map(),
  );

  return rows.map((row) => {
    const about = listings.get(row.id) ?? [];
    return {
      id: row.id,
      latestListingTitle: about[0]?.title ?? "",
      listingTitles: about.map((listing) => listing.title),
      listingHandles: about.map((listing) => listing.handle),
      withName: `${row.buyer.name} and ${row.seller.name}`,
      buyerName: row.buyer.name,
      sellerName: row.seller.name,
      staffName: row.staff?.name ?? null,
      lastMessageAt: row.lastMessageAt,
      preview: previewOf(row.messages[0]),
      unread: 0,
      flagged: row.flaggedAt !== null,
      flagReason: row.flagReason,
      closed: row.closedAt !== null,
    };
  });
}

export async function countFlaggedThreads(): Promise<number> {
  return db.conversation.count({ where: { flaggedAt: { not: null } } });
}

type SendFailure =
  | "not-allowed"
  | "bad-attachment"
  | "empty"
  | "too-long"
  | "closed";

export type SendResult =
  | { ok: true; redactedKinds: RedactionKind[] }
  | { ok: false; reason: SendFailure };

/**
 * Post a message.
 *
 * The redaction happens here rather than in the UI, because the UI is not
 * where the request has to pass through. Nothing writes to Message without
 * going past this function.
 */
export async function sendMessage(input: {
  conversationId: string;
  /**
   * The listing it is about: one already talked about in this conversation
   * or with a deal in it, and for the agent of a deal, their deal's.
   */
  listingId: string;
  sender: CurrentUser;
  body: string;
  /**
   * The storage key of something this app stored, e.g.
   * `message/<32 hex>.png`. Deliberately not a URL and not a kind: the
   * sender used to supply all three, which let an attachment point at an
   * external address — an out-of-band channel to the counterparty's browser,
   * which is the exact thing the contact redaction exists to prevent — and
   * let it point at another user's public proof screenshot, which the
   * retention sweep would then delete.
   */
  attachmentKey?: string;
  /**
   * The buyer asking about another of the same seller's listings, from its
   * page (`askSeller`): the one way a listing joins a conversation by a
   * message. Never from the message box, which writes about what is here.
   */
  joinsListing?: boolean;
}): Promise<SendResult> {
  const text = stripBidi(input.body).trim();
  // A photo or a clip on its own is a message. Requiring words alongside it
  // would just make people type a full stop.
  if (!text && !input.attachmentKey) return { ok: false, reason: "empty" };

  if (input.attachmentKey && !isChatAttachmentKey(input.attachmentKey)) {
    return { ok: false, reason: "bad-attachment" };
  }

  // And it has to be theirs. The shape check says the key could name a
  // chat attachment; this says the sender is the one who uploaded it. A key
  // that leaked from another thread could otherwise be re-attached in your
  // own, after which canReadUpload answers from whichever of the two
  // messages it happens to find first.
  if (input.attachmentKey) {
    const upload = await db.upload.findUnique({
      where: { key: input.attachmentKey },
      select: { uploaderId: true },
    });
    if (upload?.uploaderId !== input.sender.id) {
      return { ok: false, reason: "bad-attachment" };
    }
  }
  if (text.length > MAX_MESSAGE) return { ok: false, reason: "too-long" };

  const row = await db.conversation.findUnique({
    where: { id: input.conversationId },
    select: { id: true, buyerId: true, sellerId: true, closedAt: true },
  });
  if (!row) return { ok: false, reason: "not-allowed" };

  const role = await roleInThread(input.sender, row);
  if (!role) return { ok: false, reason: "not-allowed" };
  // Channel Adda's own people. The deal's agent is staff for this deal, so
  // the same exemptions hold for them.
  const ours = writesInClosedThread(role);
  // Staff can still write on a closed thread — closing it is often the moment
  // they need to explain why — and so can the agent running a deal in it.
  if (row.closedAt && !ours) return { ok: false, reason: "closed" };

  // About a listing of this conversation, and for an agent, their own deal's.
  const visible = await visibleListings(input.sender, row);
  if (visible && !visible.includes(input.listingId)) {
    return { ok: false, reason: "not-allowed" };
  }
  const here = await listingsInThread(db, row.id);
  if (!here.includes(input.listingId)) {
    const listing = input.joinsListing
      ? await db.listing.findUnique({
          where: { id: input.listingId },
          select: { sellerId: true },
        })
      : null;
    if (role !== "buyer" || listing?.sellerId !== row.sellerId) {
      return { ok: false, reason: "not-allowed" };
    }
  }

  // The listings' own handles are the subject of the conversation, not a
  // way out of it, so none of them is mistaken for a contact detail.
  const subjects = await db.listing.findMany({
    where: { id: { in: [...new Set([...here, input.listingId])] } },
    select: { handle: true },
  });
  const { body, kinds } = redactContactDetails(text, {
    allowHandles: subjects.map((listing) => listing.handle),
  });

  const flagged = kinds.length > 0 || mentionsOffPlatform(text);
  const now = new Date();

  await db.$transaction(async (tx) => {
    await tx.message.create({
      data: {
        conversationId: row.id,
        listingId: input.listingId,
        senderId: input.sender.id,
        body,
        fromStaff: role === "staff",
        ...(input.attachmentKey
          ? {
              // Derived here, never taken from the caller.
              attachmentUrl: urlForKey(input.attachmentKey),
              attachmentKind: keyIsVideo(input.attachmentKey)
                ? ("VIDEO" as const)
                : ("IMAGE" as const),
              attachmentBytes: await sizeOfUpload(input.attachmentKey),
              // Stamped now rather than worked out at read time, so changing
              // the policy later does not retroactively delete what people
              // have already sent.
              attachmentExpiresAt: mediaExpiryFrom(now),
            }
          : {}),
        redactedAt: kinds.length > 0 ? now : null,
        redactedKinds: kinds.length > 0 ? kinds.join(", ") : null,
      },
    });
    await tx.conversation.update({
      where: { id: row.id },
      data: {
        lastMessageAt: now,
        // A thread stays flagged once flagged. Staff clear it, not the next
        // clean message — otherwise the way to hide an attempt is to send
        // something innocent straight after it.
        ...(flagged && !ours
          ? {
              flaggedAt: now,
              flagReason: kinds.length
                ? `Tried to share ${kinds.join(", ")}`
                : "Suggested moving the conversation off Channel Adda",
            }
          : {}),
      },
    });
  });

  if (input.attachmentKey) {
    await markUploadsAttached([urlForKey(input.attachmentKey)]);
  }

  // Everyone else in the thread who may read this line: both sides, and the
  // agent of a deal running here on its listing. Not staff, who work from
  // their own queue. Worked out as "everyone but the sender" rather than
  // "the other side", which used to send a staff note to the buyer alone.
  // Collapsed per conversation, because a burst of ten lines should say
  // "there is something to read in here" and it stops saying that the
  // moment the bell shows ten. No email: chat arrives in bursts and an inbox
  // is the wrong place for it.
  for (const userId of await readersOf(row, input.listingId)) {
    if (userId === input.sender.id) continue;
    await notify({
      userId,
      kind: "MESSAGE",
      // Staff speak as Channel Adda here too, never by name.
      title: `${role === "staff" ? "Channel Adda" : (input.sender.name ?? "Someone")} sent you a message`,
      body: body.slice(0, 140) || "Sent an attachment.",
      href: threadHref(row.id, input.listingId),
      collapseKey: `thread:${row.id}`,
    });
  }

  return { ok: true, redactedKinds: kinds };
}

/**
 * Who reads a line about this listing as part of the thread: the buyer, the
 * seller, and the agent of each deal running here on that listing who still
 * holds the desk. The agent of a deal on another listing is not told.
 */
async function readersOf(
  row: { id: string; buyerId: string; sellerId: string },
  listingId: string,
): Promise<string[]> {
  const running = await db.order.findMany({
    where: {
      conversationId: row.id,
      listingId,
      agentId: { not: null },
      ...RUNNING,
    },
    select: { agentId: true },
  });
  const agents: string[] = [];
  for (const agentId of new Set(running.map((deal) => deal.agentId))) {
    if (
      agentId &&
      (await agentListingsOnThread(agentId, row.id)).includes(listingId)
    ) {
      agents.push(agentId);
    }
  }
  return [...new Set([row.buyerId, row.sellerId, ...agents])];
}

/**
 * Everything in the thread up to now counts as read, for this reader.
 *
 * One marker per person per thread: with the deal's agent in a conversation
 * there are three readers, and a flag on each message could only ever say
 * whether "the other side" had read it.
 */
export async function markThreadRead(
  conversationId: string,
  viewer: CurrentUser,
) {
  const row = await db.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, buyerId: true, sellerId: true },
  });
  if (!row || !(await roleInThread(viewer, row))) return;

  const now = new Date();
  await db.conversationRead.upsert({
    where: { conversationId_userId: { conversationId, userId: viewer.id } },
    create: { conversationId, userId: viewer.id, readAt: now },
    update: { readAt: now },
  });
  // And the bell: what was said here has been seen now.
  await markConversationNotificationsRead(viewer.id, [
    threadHref(conversationId),
    threadHref(conversationId, null, "/admin/messages"),
  ]);
}

/** A staff member takes the thread, so two moderators do not both answer it. */
export async function claimThread(conversationId: string, staffId: string) {
  const updated = await db.conversation.updateMany({
    where: { id: conversationId, staffId: null },
    data: { staffId },
  });
  return { ok: updated.count === 1 };
}

/** Clear the flag once a moderator has looked at it. */
export async function clearThreadFlag(conversationId: string) {
  await db.conversation.update({
    where: { id: conversationId },
    data: { flaggedAt: null, flagReason: null },
  });
}

/**
 * Close a thread. Staff only — neither side can shut the other out. It is
 * the whole conversation between the two people, every listing in it.
 */
export async function setThreadClosed(conversationId: string, closed: boolean) {
  await db.conversation.update({
    where: { id: conversationId },
    data: { closedAt: closed ? new Date() : null },
  });
}
