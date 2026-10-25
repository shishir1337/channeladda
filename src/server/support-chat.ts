import "server-only";

import { db } from "@/lib/db";
import { MAX_MESSAGE } from "@/lib/messages";
import {
  answersSupportChats,
  ESCROW_AGENT_HREF,
  ESCROW_AGENT_LINE,
  ESCROW_AGENT_NAME,
  SUPPORT_CHAT_LIMIT,
  SUPPORT_CHAT_ROLES,
  SUPPORT_CHATS_HREF,
} from "@/lib/support-chat";
import {
  isChatAttachmentKey,
  keyFromUrl,
  keyIsVideo,
  urlForKey,
} from "@/lib/upload-keys";
import { mediaExpiryFrom } from "@/server/chat-retention";
import type { ThreadMessage } from "@/server/messages";
import { notify, notifyAll } from "@/server/notifications";
import type { CurrentUser } from "@/server/session";
import { deleteUpload, sizeOfUpload } from "@/server/storage";
import { markUploadsAttached } from "@/server/upload-access";

/**
 * The Escrow Agent chat: one thread per member with Channel Adda's live
 * agents, pinned at the top of their Messages.
 *
 * Two doors, and neither takes the other's input. A member never names a
 * thread — everything they do is looked up from their own id, so there is no
 * id to guess. Staff name a thread, and every staff function re-reads the
 * caller's role and ban from the database, as `agentOnThread` does, so a desk
 * taken away is gone at once.
 *
 * Contact details are not stripped here. That rule exists so a buyer and a
 * seller cannot take a deal off the platform; this chat is with Channel Adda
 * itself, and helping someone often means reading the email or the channel
 * link they are asking about. What stays out is the bell: no notification
 * carries a word of what was written, because a support chat is where people
 * paste wallet addresses and payment details.
 */

export type EscrowAgentEntry = {
  href: string;
  /** The last line, or what the chat is for before anything was written. */
  preview: string;
  /** Null until the member first writes. */
  lastMessageAt: Date | null;
  /** Replies the member has not read yet. */
  unread: number;
};

export type SupportSendFailure =
  | "not-allowed"
  | "bad-attachment"
  | "empty"
  | "too-long"
  | "rate";

export type SupportSendResult =
  | { ok: true; threadId: string }
  | { ok: false; reason: SupportSendFailure };

/**
 * Answers support chats right now, by the database's account: one of
 * `SUPPORT_CHAT_ROLES` and not banned.
 */
export async function answersSupportNow(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, bannedAt: true },
  });
  return Boolean(user && !user.bannedAt && answersSupportChats(user.role));
}

/** What the other side wrote that this member has not read. */
function unreadWhere(memberId: string, readAt: Date | null) {
  return {
    fromAgent: true,
    // A member who is also staff and answered their own chat from the desk
    // has read what they wrote.
    senderId: { not: memberId },
    ...(readAt ? { createdAt: { gt: readAt } } : {}),
  };
}

function previewOf(
  message: { body: string; fromAgent: boolean; attachmentUrl: string | null },
  ours: boolean,
): string {
  const text = message.body || (message.attachmentUrl ? "Sent a photo." : "");
  return ours ? `You: ${text}` : text;
}

/** The pinned row before anything was written. */
const UNWRITTEN: EscrowAgentEntry = {
  href: ESCROW_AGENT_HREF,
  preview: ESCROW_AGENT_LINE,
  lastMessageAt: null,
  unread: 0,
};

/**
 * The pinned row, for every member, whether or not they have ever written.
 *
 * Read on every Messages page, so a failure here draws the row as unwritten
 * rather than taking the inbox down with it — a database not yet migrated
 * for this chat included.
 */
export async function escrowAgentEntry(
  memberId: string,
): Promise<EscrowAgentEntry> {
  try {
    return await readEntry(memberId);
  } catch (error) {
    console.error("[support-chat] pinned row", error);
    return UNWRITTEN;
  }
}

async function readEntry(memberId: string): Promise<EscrowAgentEntry> {
  const thread = await db.supportThread.findUnique({
    where: { memberId },
    select: {
      id: true,
      lastMessageAt: true,
      memberReadAt: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, fromAgent: true, attachmentUrl: true },
      },
    },
  });
  const last = thread?.messages[0];
  if (!thread || !last) return UNWRITTEN;

  const unread = await db.supportMessage.count({
    where: {
      threadId: thread.id,
      ...unreadWhere(memberId, thread.memberReadAt),
    },
  });
  return {
    href: ESCROW_AGENT_HREF,
    preview: previewOf(last, !last.fromAgent),
    lastMessageAt: thread.lastMessageAt,
    unread,
  };
}

/**
 * Unread replies, for the Messages badge (`countUnreadThreads`). That badge
 * is drawn on every dashboard page and the website's tab bar, so a failure
 * here counts nothing rather than breaking them.
 */
export async function escrowAgentUnread(memberId: string): Promise<number> {
  try {
    const thread = await db.supportThread.findUnique({
      where: { memberId },
      select: { id: true, memberReadAt: true },
    });
    if (!thread) return 0;
    return await db.supportMessage.count({
      where: {
        threadId: thread.id,
        ...unreadWhere(memberId, thread.memberReadAt),
      },
    });
  } catch (error) {
    console.error("[support-chat] unread count", error);
    return 0;
  }
}

const MESSAGE_ROW = {
  id: true,
  body: true,
  createdAt: true,
  senderId: true,
  fromAgent: true,
  attachmentUrl: true,
  attachmentKind: true,
  attachmentExpiresAt: true,
  attachmentRemovedAt: true,
  sender: { select: { name: true } },
} as const;

type MessageRow = {
  id: string;
  body: string;
  createdAt: Date;
  senderId: string;
  fromAgent: boolean;
  attachmentUrl: string | null;
  attachmentKind: "IMAGE" | "VIDEO" | null;
  attachmentExpiresAt: Date | null;
  attachmentRemovedAt: Date | null;
  sender: { name: string };
};

/**
 * One line, in the shape every chat is drawn from. A reply is the agent's —
 * a shield, never a person's face — and is named for whoever is reading.
 */
function toThreadMessage(
  row: MessageRow,
  viewerId: string,
  agentName: (row: MessageRow) => string,
  memberName: string,
): ThreadMessage {
  return {
    id: row.id,
    kind: "TEXT",
    // About no listing: this chat is the member and Channel Adda.
    listingId: null,
    opensDeal: false,
    body: row.body,
    createdAt: row.createdAt,
    mine: row.senderId === viewerId,
    fromStaff: false,
    senderName: row.fromAgent ? agentName(row) : memberName,
    senderRole: row.fromAgent ? "agent" : "buyer",
    // Nobody's page is linked from here: the replies are the Escrow Agent's,
    // and the member is talking to Channel Adda, not to another member.
    senderHref: null,
    offer: null,
    redactedKinds: null,
    attachmentUrl: row.attachmentUrl,
    attachmentKind: row.attachmentKind,
    attachmentExpiresAt: row.attachmentExpiresAt,
    attachmentRemoved: row.attachmentRemovedAt !== null,
  };
}

/**
 * The member's own chat. Looked up by who is asking and nothing else, so
 * there is no way to ask for somebody else's.
 */
export async function memberSupportThread(member: CurrentUser): Promise<{
  id: string | null;
  /** They have written since the last reply. */
  awaiting: boolean;
  messages: ThreadMessage[];
}> {
  const thread = await db.supportThread.findUnique({
    where: { memberId: member.id },
    select: {
      id: true,
      awaitingSince: true,
      messages: { orderBy: { createdAt: "asc" }, select: MESSAGE_ROW },
    },
  });
  if (!thread) return { id: null, awaiting: false, messages: [] };
  return {
    id: thread.id,
    awaiting: thread.awaitingSince !== null,
    messages: thread.messages.map((row) =>
      // Every agent is the Escrow Agent to a member: which person on the
      // team is answering is not theirs to know, as staff write as Channel
      // Adda in a deal chat.
      toThreadMessage(row, member.id, () => ESCROW_AGENT_NAME, member.name),
    ),
  };
}

/** Everything in the member's chat up to now counts as read. */
export async function markEscrowAgentRead(memberId: string): Promise<void> {
  await db.supportThread.updateMany({
    where: { memberId },
    data: { memberReadAt: new Date() },
  });
}

/**
 * The checks every line goes through, from either side: the same length
 * limit as a deal chat, and an attachment that is a chat upload this sender
 * made — never a URL, never somebody else's file (see `sendMessage`).
 */
async function checkLine(input: {
  senderId: string;
  body: string;
  attachmentKey?: string;
}): Promise<
  { ok: true; text: string } | { ok: false; reason: SupportSendFailure }
> {
  const text = input.body.trim();
  if (!text && !input.attachmentKey) return { ok: false, reason: "empty" };
  if (input.attachmentKey) {
    if (!isChatAttachmentKey(input.attachmentKey)) {
      return { ok: false, reason: "bad-attachment" };
    }
    const upload = await db.upload.findUnique({
      where: { key: input.attachmentKey },
      select: { uploaderId: true },
    });
    if (upload?.uploaderId !== input.senderId) {
      return { ok: false, reason: "bad-attachment" };
    }
  }
  if (text.length > MAX_MESSAGE) return { ok: false, reason: "too-long" };
  return { ok: true, text };
}

/** The attachment columns, derived from the key and never from the caller. */
async function attachmentData(key: string | undefined, now: Date) {
  if (!key) return {};
  return {
    attachmentUrl: urlForKey(key),
    attachmentKind: keyIsVideo(key) ? ("VIDEO" as const) : ("IMAGE" as const),
    attachmentBytes: await sizeOfUpload(key),
    attachmentExpiresAt: mediaExpiryFrom(now),
  };
}

/** The member's thread, made the first time they write. One per member. */
async function threadFor(memberId: string): Promise<{ id: string }> {
  const existing = await db.supportThread.findUnique({
    where: { memberId },
    select: { id: true },
  });
  if (existing) return existing;
  try {
    return await db.supportThread.create({
      data: { memberId },
      select: { id: true },
    });
  } catch (error) {
    // Two first messages at once: the unique index decides, and the loser
    // writes into the thread the winner made.
    const raced = await db.supportThread.findUnique({
      where: { memberId },
      select: { id: true },
    });
    if (raced) return raced;
    throw error;
  }
}

/**
 * A member writes to the Escrow Agent.
 *
 * Staff are told when a wait starts — the first line since the last reply —
 * and not again until somebody has answered it, so ten quick lines are one
 * notification, not ten.
 */
export async function sendToEscrowAgent(input: {
  member: CurrentUser;
  body: string;
  attachmentKey?: string;
}): Promise<SupportSendResult> {
  if (input.member.banned) return { ok: false, reason: "not-allowed" };
  const checked = await checkLine({
    senderId: input.member.id,
    body: input.body,
    attachmentKey: input.attachmentKey,
  });
  if (!checked.ok) return checked;

  const thread = await threadFor(input.member.id);
  const now = new Date();

  const recent = await db.supportMessage.count({
    where: {
      threadId: thread.id,
      senderId: input.member.id,
      createdAt: { gt: new Date(now.getTime() - SUPPORT_CHAT_LIMIT.windowMs) },
    },
  });
  if (recent >= SUPPORT_CHAT_LIMIT.max) return { ok: false, reason: "rate" };

  const attachment = await attachmentData(input.attachmentKey, now);
  const startedWait = await db.$transaction(async (tx) => {
    await tx.supportMessage.create({
      data: {
        threadId: thread.id,
        senderId: input.member.id,
        body: checked.text,
        ...attachment,
      },
    });
    // Only the line that starts a wait sets it, and the database decides
    // which line that is: two sent at once start one wait.
    const started = await tx.supportThread.updateMany({
      where: { id: thread.id, awaitingSince: null },
      data: { awaitingSince: now },
    });
    await tx.supportThread.update({
      where: { id: thread.id },
      data: { lastMessageAt: now },
    });
    return started.count === 1;
  });

  if (input.attachmentKey) {
    await markUploadsAttached([urlForKey(input.attachmentKey)]);
  }

  if (startedWait) {
    try {
      const desk = await db.user.findMany({
        where: {
          role: { in: [...SUPPORT_CHAT_ROLES] },
          bannedAt: null,
          id: { not: input.member.id },
        },
        select: { id: true },
      });
      await notifyAll(
        desk.map((person) => person.id),
        (userId) => ({
          userId,
          kind: "MESSAGE",
          title: `${input.member.name} wrote to the Escrow Agent`,
          // Never the words: see the top of this file.
          body: "Waiting for a reply. Open the chat to answer.",
          href: `${SUPPORT_CHATS_HREF}/${thread.id}`,
          collapseKey: `support:${thread.id}`,
        }),
      );
    } catch (error) {
      console.error("[support-chat] could not tell the desk", error);
    }
  }

  return { ok: true, threadId: thread.id };
}

/**
 * An agent answers. The member sees it as the Escrow Agent.
 *
 * In the bell and not by email, as every chat reply is: chat arrives in
 * bursts, and an inbox is the wrong place for it.
 */
export async function replyToSupportChat(input: {
  threadId: string;
  staff: CurrentUser;
  body: string;
  attachmentKey?: string;
}): Promise<SupportSendResult> {
  if (!(await answersSupportNow(input.staff.id))) {
    return { ok: false, reason: "not-allowed" };
  }
  const thread = await db.supportThread.findUnique({
    where: { id: input.threadId },
    select: { id: true, memberId: true },
  });
  if (!thread) return { ok: false, reason: "not-allowed" };

  const checked = await checkLine({
    senderId: input.staff.id,
    body: input.body,
    attachmentKey: input.attachmentKey,
  });
  if (!checked.ok) return checked;

  const now = new Date();
  const attachment = await attachmentData(input.attachmentKey, now);
  await db.$transaction([
    db.supportMessage.create({
      data: {
        threadId: thread.id,
        senderId: input.staff.id,
        fromAgent: true,
        body: checked.text,
        ...attachment,
      },
    }),
    db.supportThread.update({
      where: { id: thread.id },
      data: { lastMessageAt: now, awaitingSince: null },
    }),
  ]);

  if (input.attachmentKey) {
    await markUploadsAttached([urlForKey(input.attachmentKey)]);
  }

  if (thread.memberId !== input.staff.id) {
    await notify({
      userId: thread.memberId,
      kind: "MESSAGE",
      title: `The ${ESCROW_AGENT_NAME} replied`,
      // Never the words: see the top of this file.
      body: "Open Messages to read the reply.",
      href: ESCROW_AGENT_HREF,
      collapseKey: `support:${thread.id}`,
    });
  }

  // Answered: the rest of the desk no longer has anything to do here, so
  // the bell stops saying they do.
  try {
    await db.notification.updateMany({
      where: { href: `${SUPPORT_CHATS_HREF}/${thread.id}`, readAt: null },
      data: { readAt: now },
    });
  } catch (error) {
    console.error("[support-chat] could not clear the desk's bell", error);
  }

  return { ok: true, threadId: thread.id };
}

export type SupportChatRow = {
  id: string;
  memberId: string;
  memberName: string;
  memberEmail: string;
  /** Set while the member is waiting for a reply. */
  awaitingSince: Date | null;
  lastMessageAt: Date;
  preview: string;
};

const ROW_SELECT = {
  id: true,
  awaitingSince: true,
  lastMessageAt: true,
  member: { select: { id: true, name: true, email: true } },
  messages: {
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { body: true, fromAgent: true, attachmentUrl: true },
  },
} as const;

/**
 * The staff inbox: every chat waiting for a reply, longest wait first, then
 * the answered ones by latest message.
 *
 * The waiting ones are fetched whole rather than out of the newest hundred —
 * the member who has waited longest is the one most worth seeing, and the
 * quietest row in the list.
 */
export async function listSupportChats(take = 100): Promise<SupportChatRow[]> {
  const [waiting, answered] = await Promise.all([
    db.supportThread.findMany({
      where: { awaitingSince: { not: null } },
      orderBy: { awaitingSince: "asc" },
      select: ROW_SELECT,
    }),
    db.supportThread.findMany({
      where: { awaitingSince: null },
      orderBy: { lastMessageAt: "desc" },
      take,
      select: ROW_SELECT,
    }),
  ]);
  return [...waiting, ...answered].map((row) => {
    const last = row.messages[0];
    return {
      id: row.id,
      memberId: row.member.id,
      memberName: row.member.name,
      memberEmail: row.member.email,
      awaitingSince: row.awaitingSince,
      lastMessageAt: row.lastMessageAt,
      preview: last
        ? `${last.fromAgent ? `${ESCROW_AGENT_NAME}: ` : ""}${last.body || (last.attachmentUrl ? "Sent a photo." : "")}`
        : "",
    };
  });
}

/** Chats waiting for a reply. Drives the staff nav badge. */
export async function countSupportChatsWaiting(): Promise<number> {
  return db.supportThread.count({ where: { awaitingSince: { not: null } } });
}

export type StaffSupportChat = {
  id: string;
  member: { id: string; name: string; email: string };
  awaitingSince: Date | null;
  messages: ThreadMessage[];
};

/**
 * One chat, for the desk. Null for anyone who does not answer support chats,
 * and for an id that is not one, so guessing tells you nothing either way.
 */
export async function supportChatForStaff(
  threadId: string,
  viewer: CurrentUser,
): Promise<StaffSupportChat | null> {
  if (!(await answersSupportNow(viewer.id))) return null;
  const thread = await db.supportThread.findUnique({
    where: { id: threadId },
    select: {
      id: true,
      awaitingSince: true,
      member: { select: { id: true, name: true, email: true } },
      messages: { orderBy: { createdAt: "asc" }, select: MESSAGE_ROW },
    },
  });
  if (!thread) return null;
  return {
    id: thread.id,
    member: thread.member,
    awaitingSince: thread.awaitingSince,
    messages: thread.messages.map((row) =>
      toThreadMessage(
        row,
        viewer.id,
        // The team sees which of them answered; the member never does.
        (reply) => reply.sender.name.split(/\s+/)[0] || reply.sender.name,
        thread.member.name,
      ),
    ),
  };
}

/**
 * A short string that changes whenever a chat should redraw, for the poll
 * that keeps an open chat current. The member's own, by their id.
 */
export async function escrowAgentFingerprint(
  memberId: string,
): Promise<string> {
  const thread = await db.supportThread.findUnique({
    where: { memberId },
    select: { lastMessageAt: true, awaitingSince: true },
  });
  return thread
    ? `${thread.lastMessageAt.toISOString()}|${thread.awaitingSince?.toISOString() ?? "-"}`
    : "none";
}

/** The same, for the desk. Null for anyone who may not read it. */
export async function supportChatFingerprint(
  threadId: string,
  viewer: CurrentUser,
): Promise<string | null> {
  if (!(await answersSupportNow(viewer.id))) return null;
  const thread = await db.supportThread.findUnique({
    where: { id: threadId },
    select: { lastMessageAt: true, awaitingSince: true },
  });
  return thread
    ? `${thread.lastMessageAt.toISOString()}|${thread.awaitingSince?.toISOString() ?? "-"}`
    : null;
}

/**
 * Deletes expired attachment files, as `purgeExpiredMedia` does for deal
 * chats: 48 hours, then the file goes and the line explains the gap. There
 * is no deal here for a dispute to need them for.
 */
export async function purgeExpiredSupportMedia(
  now = new Date(),
): Promise<number> {
  const due = await db.supportMessage.findMany({
    where: {
      attachmentUrl: { not: null },
      attachmentRemovedAt: null,
      attachmentExpiresAt: { lte: now },
    },
    select: { id: true, attachmentUrl: true },
    take: 500,
  });

  let removed = 0;
  for (const message of due) {
    if (!message.attachmentUrl) continue;
    const key = keyFromUrl(message.attachmentUrl);
    if (key && isChatAttachmentKey(key)) {
      try {
        await deleteUpload(key);
      } catch (error) {
        // A file already gone is fine — the row still needs clearing.
        console.error(`[support-chat] could not delete ${key}`, error);
      }
    }
    const cleared = await db.supportMessage.updateMany({
      where: { id: message.id, attachmentRemovedAt: null },
      data: {
        attachmentUrl: null,
        attachmentKind: null,
        attachmentBytes: null,
        attachmentRemovedAt: now,
      },
    });
    removed += cleared.count;
  }
  return removed;
}
