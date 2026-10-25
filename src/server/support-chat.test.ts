import { randomBytes } from "node:crypto";
import { expect, test } from "vitest";
import { db } from "@/lib/db";
import {
  ESCROW_AGENT_HREF,
  ESCROW_AGENT_LINE,
  ESCROW_AGENT_NAME,
  SUPPORT_CHATS_HREF,
} from "@/lib/support-chat";
import { urlForKey } from "@/lib/upload-keys";
import { createDeal } from "@/server/deals";
import { memberInbox } from "@/server/inbox";
import { countUnreadThreads, openConversation } from "@/server/messages";
import type { CurrentUser } from "@/server/session";
import {
  countSupportChatsWaiting,
  escrowAgentEntry,
  escrowAgentUnread,
  listSupportChats,
  markEscrowAgentRead,
  memberSupportThread,
  replyToSupportChat,
  sendToEscrowAgent,
  supportChatForStaff,
} from "@/server/support-chat";
import { canReadUpload } from "@/server/upload-access";
import { seedListing, seedUser, withCleanDb } from "@/test/db";

/**
 * The Escrow Agent: every member's own chat with Channel Adda's live agents,
 * pinned at the top of Messages, made by their first message.
 */

function asUser(
  user: { id: string; name: string; role: CurrentUser["role"] },
  banned = false,
): CurrentUser {
  return {
    id: user.id,
    email: "someone@example.test",
    name: user.name,
    image: null,
    emailVerified: true,
    role: user.role,
    slug: null,
    banned,
  };
}

async function people() {
  const [member, other, agent, moderator] = await Promise.all([
    seedUser("USER"),
    seedUser("USER"),
    seedUser("AGENT"),
    seedUser("MODERATOR"),
  ]);
  return {
    member: asUser(member),
    other: asUser(other),
    agent: asUser(agent),
    moderator: asUser(moderator),
  };
}

/** An upload row for a chat photo, as the upload route would write it. */
async function chatUpload(uploaderId: string) {
  const key = `message/${randomBytes(16).toString("hex")}.png`;
  await db.upload.create({
    data: {
      key,
      uploaderId,
      kind: "message",
      bytes: 10,
      contentType: "image/png",
    },
  });
  return key;
}

test(
  "the first message makes the chat, and every later one goes into it",
  withCleanDb(async () => {
    const { member } = await people();

    // Pinned before anything was written: no thread exists yet.
    expect(await db.supportThread.count()).toBe(0);
    const before = await escrowAgentEntry(member.id);
    expect(before).toMatchObject({
      href: ESCROW_AGENT_HREF,
      preview: ESCROW_AGENT_LINE,
      lastMessageAt: null,
      unread: 0,
    });

    const first = await sendToEscrowAgent({
      member,
      body: "My payment has not shown up on the deal.",
    });
    expect(first.ok).toBe(true);
    const second = await sendToEscrowAgent({ member, body: "Ref CA-1234." });
    expect(second.ok).toBe(true);

    const threads = await db.supportThread.findMany();
    expect(threads).toHaveLength(1);
    expect(threads[0]?.memberId).toBe(member.id);
    expect(threads[0]?.awaitingSince).not.toBeNull();
    if (first.ok && second.ok) expect(second.threadId).toBe(first.threadId);

    const mine = await memberSupportThread(member);
    expect(mine.messages.map((m) => m.body)).toEqual([
      "My payment has not shown up on the deal.",
      "Ref CA-1234.",
    ]);
    expect(mine.messages.every((m) => m.mine)).toBe(true);
    expect(mine.awaiting).toBe(true);
    expect((await escrowAgentEntry(member.id)).preview).toBe(
      "You: Ref CA-1234.",
    );
  }),
);

test(
  "the same checks as a deal chat: empty, too long, and someone else's file",
  withCleanDb(async () => {
    const { member, other } = await people();
    expect(await sendToEscrowAgent({ member, body: "   " })).toEqual({
      ok: false,
      reason: "empty",
    });
    expect(await sendToEscrowAgent({ member, body: "x".repeat(4001) })).toEqual(
      { ok: false, reason: "too-long" },
    );

    const theirs = await chatUpload(other.id);
    expect(
      await sendToEscrowAgent({ member, body: "", attachmentKey: theirs }),
    ).toEqual({ ok: false, reason: "bad-attachment" });
    expect(
      await sendToEscrowAgent({
        member,
        body: "",
        attachmentKey: "cover/0123456789abcdef0123456789abcdef.png",
      }),
    ).toEqual({ ok: false, reason: "bad-attachment" });

    // A photo of their own, on its own, is a message.
    const mine = await chatUpload(member.id);
    const sent = await sendToEscrowAgent({
      member,
      body: "",
      attachmentKey: mine,
    });
    expect(sent.ok).toBe(true);
    const line = await db.supportMessage.findFirstOrThrow();
    expect(line.attachmentUrl).toBe(urlForKey(mine));
    expect(line.attachmentKind).toBe("IMAGE");
    expect(line.attachmentExpiresAt).not.toBeNull();
    expect(
      (await db.upload.findUniqueOrThrow({ where: { key: mine } })).attachedAt,
    ).not.toBeNull();
  }),
);

test(
  "one member never sees another member's chat",
  withCleanDb(async () => {
    const { member, other, agent } = await people();
    const photo = await chatUpload(member.id);
    const sent = await sendToEscrowAgent({
      member,
      body: "Here is my bank screenshot.",
      attachmentKey: photo,
    });
    if (!sent.ok) throw new Error(sent.reason);
    const replyPhoto = await chatUpload(agent.id);
    await replyToSupportChat({
      threadId: sent.threadId,
      staff: agent,
      body: "Thanks, checking.",
      attachmentKey: replyPhoto,
    });

    // Their own Messages: nothing of the first member's.
    expect(await memberSupportThread(other)).toEqual({
      id: null,
      awaiting: false,
      messages: [],
    });
    expect((await escrowAgentEntry(other.id)).preview).toBe(ESCROW_AGENT_LINE);
    expect(await escrowAgentUnread(other.id)).toBe(0);
    // Nor by naming the thread, through the desk's door.
    expect(await supportChatForStaff(sent.threadId, other)).toBeNull();
    // Nor the files in it.
    expect(await canReadUpload(photo, other)).toBe(false);
    expect(await canReadUpload(replyPhoto, other)).toBe(false);

    // The member reads the agent's photo; the agent reads the member's.
    expect(await canReadUpload(replyPhoto, member)).toBe(true);
    expect(await canReadUpload(photo, agent)).toBe(true);

    // Writing again makes the second member a chat of their own.
    const theirs = await sendToEscrowAgent({ member: other, body: "Hello" });
    if (!theirs.ok) throw new Error(theirs.reason);
    expect(theirs.threadId).not.toBe(sent.threadId);
    expect((await memberSupportThread(other)).messages).toHaveLength(1);
    expect((await memberSupportThread(member)).messages).toHaveLength(2);
  }),
);

test(
  "somebody who is not staff cannot read or reply from the desk",
  withCleanDb(async () => {
    const { member, other, agent } = await people();
    const sent = await sendToEscrowAgent({ member, body: "Help please" });
    if (!sent.ok) throw new Error(sent.reason);

    expect(await supportChatForStaff(sent.threadId, other)).toBeNull();
    expect(
      await replyToSupportChat({
        threadId: sent.threadId,
        staff: other,
        body: "I am an agent, honest.",
      }),
    ).toEqual({ ok: false, reason: "not-allowed" });

    // Not by a session that still says AGENT, either: the role is read
    // from the database, so a desk taken away is gone at once.
    await db.user.update({ where: { id: agent.id }, data: { role: "USER" } });
    expect(await supportChatForStaff(sent.threadId, agent)).toBeNull();
    expect(
      await replyToSupportChat({
        threadId: sent.threadId,
        staff: agent,
        body: "Still here?",
      }),
    ).toEqual({ ok: false, reason: "not-allowed" });

    // A banned moderator neither.
    const banned = await seedUser("MODERATOR");
    await db.user.update({
      where: { id: banned.id },
      data: { bannedAt: new Date() },
    });
    expect(await supportChatForStaff(sent.threadId, asUser(banned))).toBeNull();

    expect(await db.supportMessage.count({ where: { fromAgent: true } })).toBe(
      0,
    );
  }),
);

test(
  "the desk is told once per wait, without the words",
  withCleanDb(async () => {
    const { member, agent, moderator } = await people();
    const finance = await seedUser("FINANCE");
    const superadmin = await seedUser("SUPERADMIN");
    const sent = await sendToEscrowAgent({
      member,
      body: "My wallet is TXyz1234567890abcdefghijklmnop and nothing arrived.",
    });
    if (!sent.ok) throw new Error(sent.reason);
    await sendToEscrowAgent({ member, body: "Hello?" });
    await sendToEscrowAgent({ member, body: "Anyone?" });

    const href = `${SUPPORT_CHATS_HREF}/${sent.threadId}`;
    for (const id of [agent.id, moderator.id, finance.id, superadmin.id]) {
      const rows = await db.notification.findMany({ where: { userId: id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.href).toBe(href);
      expect(rows[0]?.body).not.toContain("TXyz");
      expect(rows[0]?.title).toContain(ESCROW_AGENT_NAME);
    }
    // Never the member who wrote.
    expect(await db.notification.count({ where: { userId: member.id } })).toBe(
      0,
    );
    expect(await countSupportChatsWaiting()).toBe(1);
  }),
);

test(
  "a reply marks the chat answered and tells the member",
  withCleanDb(async () => {
    const { member, agent, moderator } = await people();
    const sent = await sendToEscrowAgent({ member, body: "Is my deal safe?" });
    if (!sent.ok) throw new Error(sent.reason);

    const replied = await replyToSupportChat({
      threadId: sent.threadId,
      staff: agent,
      body: "Yes. Our agent holds the channel. Pay to 1234 5678 9012 3456.",
    });
    expect(replied.ok).toBe(true);

    const thread = await db.supportThread.findUniqueOrThrow({
      where: { id: sent.threadId },
    });
    expect(thread.awaitingSince).toBeNull();
    expect(await countSupportChatsWaiting()).toBe(0);

    const told = await db.notification.findMany({
      where: { userId: member.id },
    });
    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({ kind: "MESSAGE", href: ESCROW_AGENT_HREF });
    expect(told[0]?.title).toContain(ESCROW_AGENT_NAME);
    expect(told[0]?.body).not.toContain("1234");

    // Answered: the rest of the desk's bell stops pointing at it.
    const desk = await db.notification.findFirstOrThrow({
      where: { userId: moderator.id },
    });
    expect(desk.readAt).not.toBeNull();

    // The member sees the Escrow Agent, never the agent's name.
    const mine = await memberSupportThread(member);
    const reply = mine.messages.at(-1);
    expect(reply).toMatchObject({
      senderName: ESCROW_AGENT_NAME,
      senderRole: "agent",
      mine: false,
    });
    expect(JSON.stringify(mine)).not.toContain(agent.name);

    // Writing again starts a new wait and tells the desk again.
    await sendToEscrowAgent({ member, body: "One more thing." });
    expect(
      await db.notification.count({
        where: { userId: moderator.id, readAt: null },
      }),
    ).toBe(1);
  }),
);

test(
  "an unread reply counts on the member's Messages badge",
  withCleanDb(async () => {
    const { member, agent } = await people();
    const sent = await sendToEscrowAgent({ member, body: "Question" });
    if (!sent.ok) throw new Error(sent.reason);
    // Their own line is not unread.
    expect(await countUnreadThreads(member.id)).toBe(0);

    await replyToSupportChat({
      threadId: sent.threadId,
      staff: agent,
      body: "Answer",
    });
    expect(await countUnreadThreads(member.id)).toBe(1);
    expect((await escrowAgentEntry(member.id)).unread).toBe(1);

    await markEscrowAgentRead(member.id);
    expect(await countUnreadThreads(member.id)).toBe(0);
    expect((await escrowAgentEntry(member.id)).unread).toBe(0);
  }),
);

test(
  "the Escrow Agent is first in Messages, with and without other conversations",
  withCleanDb(async () => {
    const seeded = await seedListing();
    const buyer = asUser(seeded.buyer);

    const alone = await memberInbox(buyer);
    expect(alone).toHaveLength(1);
    expect(alone[0]?.kind).toBe("escrow-agent");

    // A conversation with a running deal, which sorts above everything else
    // in the list — but not above the Escrow Agent.
    const opened = await openConversation({
      listingId: seeded.listing.id,
      buyerId: buyer.id,
    });
    if (!opened.ok) throw new Error(opened.reason);
    const deal = await createDeal({
      listingId: seeded.listing.id,
      buyerId: buyer.id,
      mode: "SAFEST",
      acceptedRevenueRisk: true,
    });
    if (!deal.ok) throw new Error(deal.reason);

    const inbox = await memberInbox(buyer);
    expect(inbox.map((row) => row.kind)).toEqual(["escrow-agent", "thread"]);
    const thread = inbox[1];
    expect(thread?.kind === "thread" && thread.deals.length > 0).toBeTruthy();
  }),
);

test(
  "the desk lists waiting chats first, the longest wait at the top",
  withCleanDb(async () => {
    const { member, other, agent } = await people();
    const third = asUser(await seedUser("USER"));

    const a = await sendToEscrowAgent({ member, body: "First to write" });
    const b = await sendToEscrowAgent({ member: other, body: "Second" });
    const c = await sendToEscrowAgent({ member: third, body: "Third" });
    if (!a.ok || !b.ok || !c.ok) throw new Error("send failed");
    // Spread the waits apart so the order is not decided by the clock.
    const hour = 3_600_000;
    await db.supportThread.update({
      where: { id: a.threadId },
      data: { awaitingSince: new Date(Date.now() - 3 * hour) },
    });
    await db.supportThread.update({
      where: { id: b.threadId },
      data: { awaitingSince: new Date(Date.now() - 2 * hour) },
    });
    // The third is answered, so it goes below both waiting ones.
    await replyToSupportChat({
      threadId: c.threadId,
      staff: agent,
      body: "Done",
    });

    const rows = await listSupportChats();
    expect(rows.map((row) => row.id)).toEqual([
      a.threadId,
      b.threadId,
      c.threadId,
    ]);
    expect(rows[2]?.awaitingSince).toBeNull();
    expect(rows[2]?.preview).toBe(`${ESCROW_AGENT_NAME}: Done`);
  }),
);
