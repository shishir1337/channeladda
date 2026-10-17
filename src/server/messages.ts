import "server-only";

import type { OfferStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { MAX_MESSAGE } from "@/lib/messages";
import {
  mentionsOffPlatform,
  type RedactionKind,
  redactContactDetails,
} from "@/lib/redact";
import { writesInClosedThread } from "@/lib/thread-rules";
import { isChatAttachmentKey, keyIsVideo, urlForKey } from "@/lib/upload-keys";
import { mediaExpiryFrom } from "@/server/chat-retention";
import { notify } from "@/server/notifications";
import { offerTurn } from "@/server/offers";
import type { CurrentUser } from "@/server/session";
import { sizeOfUpload } from "@/server/storage";
import {
  agentOnThread,
  runningDealsOf,
  stillAnAgent,
} from "@/server/thread-access";
import { markUploadsAttached } from "@/server/upload-access";

/**
 * Every conversation on Channel Adda.
 *
 * There is no direct buyer-to-seller channel in this product and there is no
 * function here that would create one. A message belongs to a conversation, a
 * conversation belongs to a listing, both sides are named on it, and staff can
 * read and join any of them. Contact details are stripped on the way in, so
 * the pair cannot agree to finish the deal somewhere the escrow does not
 * reach — which is the whole point, because off-platform is where the scam
 * happens and where we can do nothing about it.
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
  body: string;
  createdAt: Date;
  mine: boolean;
  fromStaff: boolean;
  senderName: string;
  senderRole: SenderRole;
  /** Set on an offer card only. */
  offer: ThreadOffer | null;
  /** What was taken out, shown to everyone so the gap is never a mystery. */
  redactedKinds: string | null;
  attachmentUrl: string | null;
  attachmentKind: "IMAGE" | "VIDEO" | null;
  attachmentExpiresAt: Date | null;
  /** True once the file has been deleted, so the gap can be explained. */
  attachmentRemoved: boolean;
};

export type Thread = {
  id: string;
  listingId: string;
  listingSlug: string;
  listingTitle: string;
  listingHandle: string;
  listingPrice: number;
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

export type ThreadSummary = {
  id: string;
  listingSlug: string;
  listingTitle: string;
  listingHandle: string;
  /** The other side, named for whoever is reading the list. */
  withName: string;
  lastMessageAt: Date;
  preview: string;
  unread: number;
  flagged: boolean;
  closed: boolean;
};

const STAFF_ROLES = ["MODERATOR", "FINANCE", "SUPERADMIN"];

function isStaff(user: CurrentUser) {
  return STAFF_ROLES.includes(user.role);
}

/**
 * Start talking about a listing, or pick up where it left off.
 *
 * One thread per buyer per listing. A buyer with three questions should not
 * leave a seller with three threads, and staff reviewing a dispute should have
 * one place to read the whole history.
 */
/**
 * What a new thread starts with.
 *
 * Deliberately a real question rather than "hi": it is sent as the buyer, and
 * a seller who opens their inbox should find something they can answer in one
 * reply instead of an opener that costs a round trip.
 */
export const OPENING_MESSAGE =
  "Hi — I'm interested in this one. Is it still available, and is there anything about the account or the handover I should know before I make an offer?";

export async function openConversation(input: {
  listingId: string;
  buyerId: string;
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

  // Racing double-clicks both land here. The unique index decides, and the
  // loser reads back the row the winner made rather than failing at the user.
  const existing = await db.conversation.findUnique({
    where: {
      listingId_buyerId: { listingId: listing.id, buyerId: input.buyerId },
    },
    select: { id: true },
  });
  if (existing) return { ok: true, id: existing.id };

  try {
    const created = await db.conversation.create({
      data: {
        listingId: listing.id,
        buyerId: input.buyerId,
        sellerId: listing.sellerId,
        // Written as the buyer, so the thread arrives in the seller's inbox
        // as a question rather than as an empty row. An empty thread tells
        // the seller somebody looked and nothing more, and it gives the buyer
        // a blank box to work out what to say into.
        messages: {
          create: {
            senderId: input.buyerId,
            body: OPENING_MESSAGE,
          },
        },
      },
      select: { id: true },
    });

    // Deals may already exist — the buyer can pay first and ask questions
    // after. Linked here so the thread is part of their record from the
    // moment it is created, rather than waiting for a sweep to notice. Every
    // one of them, not the latest: each needs its conversation.
    await db.order.updateMany({
      where: {
        listingId: listing.id,
        buyerId: input.buyerId,
        conversationId: null,
      },
      data: { conversationId: created.id },
    });

    return { ok: true, id: created.id };
  } catch {
    const raced = await db.conversation.findUnique({
      where: {
        listingId_buyerId: { listingId: listing.id, buyerId: input.buyerId },
      },
      select: { id: true },
    });
    if (raced) return { ok: true, id: raced.id };
    return { ok: false, reason: "not-found" };
  }
}

/**
 * Read a thread, if this person is allowed to.
 *
 * Not being a participant returns null rather than an error: a stranger
 * guessing conversation ids learns nothing about which ones exist.
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
      listing: {
        select: {
          id: true,
          slug: true,
          title: true,
          handle: true,
          priceUsd: true,
        },
      },
      buyer: { select: { id: true, name: true } },
      seller: { select: { id: true, name: true } },
      staff: { select: { name: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          attachmentUrl: true,
          attachmentKind: true,
          attachmentExpiresAt: true,
          attachmentRemovedAt: true,
          id: true,
          body: true,
          createdAt: true,
          senderId: true,
          fromStaff: true,
          redactedKinds: true,
          kind: true,
          sender: { select: { name: true } },
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
      },
    },
  });
  if (!row) return null;

  const viewerRole = await roleInThread(viewer, row);
  if (!viewerRole) return null;

  const now = new Date();

  return {
    id: row.id,
    listingId: row.listing.id,
    listingSlug: row.listing.slug,
    listingTitle: row.listing.title,
    listingHandle: row.listing.handle,
    listingPrice: row.listing.priceUsd,
    buyerName: row.buyer.name,
    sellerName: row.seller.name,
    staffName: row.staff?.name ?? null,
    viewerRole,
    flaggedAt: row.flaggedAt,
    flagReason: row.flagReason,
    closedAt: row.closedAt,
    messages: row.messages.map((message) => ({
      id: message.id,
      kind: message.kind,
      body: message.body,
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
    })),
  };
}

/**
 * Who an entry is from, as the thread shows it.
 *
 * Staff speak as Channel Adda, not as a named person: a buyer should not
 * learn which moderator is reading their dispute. The platform's own events
 * have no sender and read as Channel Adda too. Anyone else who is neither
 * side is the deal's agent, the only other person who can write here.
 */
function senderOf(
  message: {
    senderId: string | null;
    fromStaff: boolean;
    sender: { name: string } | null;
  },
  row: { buyerId: string; sellerId: string },
): { senderName: string; senderRole: SenderRole } {
  if (message.fromStaff) {
    return { senderName: "Channel Adda", senderRole: "staff" };
  }
  if (message.senderId === null || message.sender === null) {
    return { senderName: "Channel Adda", senderRole: "system" };
  }
  const senderRole: SenderRole =
    message.senderId === row.buyerId
      ? "buyer"
      : message.senderId === row.sellerId
        ? "seller"
        : "agent";
  return { senderName: message.sender.name, senderRole };
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
  if (isStaff(viewer)) return "staff";
  if (viewer.role === "AGENT" && (await agentOnThread(viewer.id, row.id))) {
    return "agent";
  }
  return null;
}

/**
 * How many entries in each of these threads this person has not read.
 *
 * Unread means written by somebody else — never by the reader, never by the
 * platform itself (a payment clearing is told by its own notification) —
 * after the reader's own marker, or ever when they have none. One query for
 * all of them: a per-thread threshold is not something Prisma's filters can
 * say, and an inbox of fifty threads should not be fifty queries.
 */
async function unreadByThread(
  userId: string,
  conversationIds: string[],
): Promise<Map<string, number>> {
  if (conversationIds.length === 0) return new Map();
  const rows = await db.$queryRaw<{ conversationId: string; unread: number }[]>`
    SELECT m."conversationId", COUNT(*)::int AS unread
    FROM "Message" AS m
    LEFT JOIN "ConversationRead" AS r
      ON r."conversationId" = m."conversationId" AND r."userId" = ${userId}
    WHERE m."conversationId" = ANY(${conversationIds})
      AND m."senderId" IS NOT NULL
      AND m."senderId" <> ${userId}
      AND (r."readAt" IS NULL OR m."createdAt" > r."readAt")
    GROUP BY m."conversationId"
  `;
  return new Map(rows.map((row) => [row.conversationId, row.unread]));
}

/** Everything this person is part of, newest first. */
export async function listThreads(
  viewer: CurrentUser,
  take = 50,
): Promise<ThreadSummary[]> {
  // An agent's inbox is the conversations of the deals they are running, by
  // the same rule as reading one — re-read from the database for the same
  // reason.
  const asAgent = viewer.role === "AGENT" && (await stillAnAgent(viewer.id));

  const rows = await db.conversation.findMany({
    where: {
      OR: [
        { buyerId: viewer.id },
        { sellerId: viewer.id },
        ...(asAgent ? [{ orders: runningDealsOf(viewer.id) }] : []),
      ],
    },
    orderBy: { lastMessageAt: "desc" },
    take,
    select: {
      id: true,
      buyerId: true,
      sellerId: true,
      lastMessageAt: true,
      flaggedAt: true,
      closedAt: true,
      listing: { select: { slug: true, title: true, handle: true } },
      buyer: { select: { name: true } },
      seller: { select: { name: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, fromStaff: true },
      },
    },
  });
  const unread = await unreadByThread(
    viewer.id,
    rows.map((row) => row.id),
  );

  return rows.map((row) => {
    const iAmBuyer = row.buyerId === viewer.id;
    const iAmSeller = row.sellerId === viewer.id;
    return {
      id: row.id,
      listingSlug: row.listing.slug,
      listingTitle: row.listing.title,
      listingHandle: row.listing.handle,
      // An agent is talking to both of them.
      withName: iAmBuyer
        ? row.seller.name
        : iAmSeller
          ? row.buyer.name
          : `${row.buyer.name} and ${row.seller.name}`,
      lastMessageAt: row.lastMessageAt,
      preview: row.messages[0]
        ? `${row.messages[0].fromStaff ? "Channel Adda: " : ""}${row.messages[0].body}`
        : "No messages yet.",
      unread: unread.get(row.id) ?? 0,
      flagged: row.flaggedAt !== null,
      closed: row.closedAt !== null,
    };
  });
}

/** How many threads are waiting on this person. Drives the sidebar badge. */
export async function countUnreadThreads(userId: string): Promise<number> {
  const asAgent = await stillAnAgent(userId);
  const threads = await db.conversation.findMany({
    where: {
      OR: [
        { buyerId: userId },
        { sellerId: userId },
        ...(asAgent ? [{ orders: runningDealsOf(userId) }] : []),
      ],
    },
    select: { id: true },
  });
  const unread = await unreadByThread(
    userId,
    threads.map((row) => row.id),
  );
  return [...unread.values()].filter((n) => n > 0).length;
}

export type StaffThread = ThreadSummary & {
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
      listing: { select: { slug: true, title: true, handle: true } },
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

  return rows.map((row) => ({
    id: row.id,
    listingSlug: row.listing.slug,
    listingTitle: row.listing.title,
    listingHandle: row.listing.handle,
    withName: `${row.buyer.name} and ${row.seller.name}`,
    buyerName: row.buyer.name,
    sellerName: row.seller.name,
    staffName: row.staff?.name ?? null,
    lastMessageAt: row.lastMessageAt,
    preview: row.messages[0]
      ? `${row.messages[0].fromStaff ? "Channel Adda: " : ""}${row.messages[0].body}`
      : "No messages yet.",
    unread: 0,
    flagged: row.flaggedAt !== null,
    flagReason: row.flagReason,
    closed: row.closedAt !== null,
  }));
}

export async function countFlaggedThreads(): Promise<number> {
  return db.conversation.count({ where: { flaggedAt: { not: null } } });
}

export type SendResult =
  | { ok: true; redactedKinds: RedactionKind[] }
  | {
      ok: false;
      reason:
        | "not-allowed"
        | "bad-attachment"
        | "empty"
        | "too-long"
        | "closed";
    };

/**
 * Post a message.
 *
 * The redaction happens here rather than in the UI, because the UI is not
 * where the request has to pass through. Nothing writes to Message without
 * going past this function.
 */
export async function sendMessage(input: {
  conversationId: string;
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
}): Promise<SendResult> {
  const text = input.body.trim();
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
    select: {
      id: true,
      buyerId: true,
      sellerId: true,
      closedAt: true,
      listing: { select: { handle: true, title: true } },
    },
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

  // The listing's own handle is the subject of the conversation, not a way out
  // of it, so it is never mistaken for a contact detail.
  const { body, kinds } = redactContactDetails(text, {
    allowHandles: [row.listing.handle],
  });

  const flagged = kinds.length > 0 || mentionsOffPlatform(text);
  const now = new Date();

  await db.$transaction(async (tx) => {
    await tx.message.create({
      data: {
        conversationId: row.id,
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

  // Everyone else in the thread: both sides, and the agent of a deal running
  // here. Not staff, who work from their own queue. Worked out as "everyone
  // but the sender" rather than "the other side", which used to send a staff
  // note to the buyer alone. Collapsed per conversation, because a burst of
  // ten lines should say "there is something to read in here" and it stops
  // saying that the moment the bell shows ten. No email: chat arrives in
  // bursts and an inbox is the wrong place for it.
  for (const userId of await readersOf(row)) {
    if (userId === input.sender.id) continue;
    await notify({
      userId,
      kind: "MESSAGE",
      // Staff speak as Channel Adda here too, never by name.
      title: `${role === "staff" ? "Channel Adda" : (input.sender.name ?? "Someone")} sent you a message`,
      body: body.slice(0, 140) || "Sent an attachment.",
      href: `/dashboard/messages/${row.id}`,
      collapseKey: `thread:${row.id}`,
    });
  }

  return { ok: true, redactedKinds: kinds };
}

/**
 * Who reads a thread as part of it: the buyer, the seller, and the agent of
 * each deal running in it who still holds the desk.
 */
async function readersOf(row: {
  id: string;
  buyerId: string;
  sellerId: string;
}): Promise<string[]> {
  const running = await db.order.findMany({
    where: { conversationId: row.id, agentId: { not: null } },
    select: { agentId: true },
  });
  const agents: string[] = [];
  for (const { agentId } of running) {
    if (agentId && (await agentOnThread(agentId, row.id))) agents.push(agentId);
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

/** Close a thread. Staff only — neither side can shut the other out. */
export async function setThreadClosed(conversationId: string, closed: boolean) {
  await db.conversation.update({
    where: { id: conversationId },
    data: { closedAt: closed ? new Date() : null },
  });
}
