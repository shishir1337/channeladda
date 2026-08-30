import "server-only";

import { db } from "@/lib/db";
import { MAX_MESSAGE } from "@/lib/messages";
import {
  mentionsOffPlatform,
  type RedactionKind,
  redactContactDetails,
} from "@/lib/redact";
import type { CurrentUser } from "@/server/session";

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

export type ThreadRole = "buyer" | "seller" | "staff";

export type ThreadMessage = {
  id: string;
  body: string;
  createdAt: Date;
  mine: boolean;
  fromStaff: boolean;
  senderName: string;
  senderRole: ThreadRole;
  /** What was taken out, shown to everyone so the gap is never a mystery. */
  redactedKinds: string | null;
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
      },
      select: { id: true },
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
          id: true,
          body: true,
          createdAt: true,
          senderId: true,
          fromStaff: true,
          redactedKinds: true,
          sender: { select: { name: true } },
        },
      },
    },
  });
  if (!row) return null;

  const viewerRole = roleOf(viewer, row);
  if (!viewerRole) return null;

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
      body: message.body,
      createdAt: message.createdAt,
      mine: message.senderId === viewer.id,
      fromStaff: message.fromStaff,
      // Staff speak as Channel Adda, not as a named person. A buyer should not
      // learn which moderator is reading their dispute.
      senderName: message.fromStaff ? "Channel Adda" : message.sender.name,
      senderRole: message.fromStaff
        ? "staff"
        : message.senderId === row.buyerId
          ? "buyer"
          : "seller",
      redactedKinds: message.redactedKinds,
    })),
  };
}

function roleOf(
  viewer: CurrentUser,
  row: { buyerId: string; sellerId: string },
): ThreadRole | null {
  if (row.buyerId === viewer.id) return "buyer";
  if (row.sellerId === viewer.id) return "seller";
  if (isStaff(viewer)) return "staff";
  return null;
}

/** Everything this person is part of, newest first. */
export async function listThreads(
  viewer: CurrentUser,
  take = 50,
): Promise<ThreadSummary[]> {
  const rows = await db.conversation.findMany({
    where: { OR: [{ buyerId: viewer.id }, { sellerId: viewer.id }] },
    orderBy: { lastMessageAt: "desc" },
    take,
    select: {
      id: true,
      buyerId: true,
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
      _count: {
        select: {
          messages: { where: { readAt: null, senderId: { not: viewer.id } } },
        },
      },
    },
  });

  return rows.map((row) => {
    const iAmBuyer = row.buyerId === viewer.id;
    return {
      id: row.id,
      listingSlug: row.listing.slug,
      listingTitle: row.listing.title,
      listingHandle: row.listing.handle,
      withName: iAmBuyer ? row.seller.name : row.buyer.name,
      lastMessageAt: row.lastMessageAt,
      preview: row.messages[0]
        ? `${row.messages[0].fromStaff ? "Channel Adda: " : ""}${row.messages[0].body}`
        : "No messages yet.",
      unread: row._count.messages,
      flagged: row.flaggedAt !== null,
      closed: row.closedAt !== null,
    };
  });
}

/** How many threads are waiting on this person. Drives the sidebar badge. */
export async function countUnreadThreads(userId: string): Promise<number> {
  return db.conversation.count({
    where: {
      OR: [{ buyerId: userId }, { sellerId: userId }],
      messages: { some: { readAt: null, senderId: { not: userId } } },
    },
  });
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
  | { ok: false; reason: "not-allowed" | "empty" | "too-long" | "closed" };

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
}): Promise<SendResult> {
  const text = input.body.trim();
  if (!text) return { ok: false, reason: "empty" };
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

  const role = roleOf(input.sender, row);
  if (!role) return { ok: false, reason: "not-allowed" };
  // Staff can still write on a closed thread — closing it is often the moment
  // they need to explain why.
  if (row.closedAt && role !== "staff") return { ok: false, reason: "closed" };

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
        ...(flagged && role !== "staff"
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

  return { ok: true, redactedKinds: kinds };
}

/** Mark everything the other side said as read. */
export async function markThreadRead(
  conversationId: string,
  viewer: CurrentUser,
) {
  const row = await db.conversation.findUnique({
    where: { id: conversationId },
    select: { buyerId: true, sellerId: true },
  });
  if (!row || !roleOf(viewer, row)) return;

  await db.message.updateMany({
    where: {
      conversationId,
      senderId: { not: viewer.id },
      readAt: null,
    },
    data: { readAt: new Date() },
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
