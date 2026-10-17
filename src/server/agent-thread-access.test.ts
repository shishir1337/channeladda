import { expect, test } from "vitest";
import { db } from "@/lib/db";
import {
  assignAgent,
  createDeal,
  expireStaleDeals,
  resolveDeal,
} from "@/server/deals";
import {
  getThread,
  listThreads,
  openConversation,
  sendMessage,
} from "@/server/messages";
import type { CurrentUser } from "@/server/session";
import { threadFingerprint } from "@/server/thread-fingerprint";
import { canReadUpload } from "@/server/upload-access";
import { seedListing, seedUser, withCleanDb } from "@/test/db";

/**
 * The agent of a deal joins its conversation — for exactly as long as they
 * are running that deal, and no longer.
 *
 * An agent is staff for the deals they are assigned to, not for the
 * platform: they must never read a conversation about somebody else's deal,
 * or keep reading one once their part is over.
 */

const KEY = "message/0123456789abcdef0123456789abcdef.png";

function asUser(
  id: string,
  role: CurrentUser["role"] = "USER",
  name = "Someone",
): CurrentUser {
  return {
    id,
    email: "someone@example.test",
    name,
    image: null,
    emailVerified: true,
    role,
    slug: null,
    banned: false,
  };
}

/** A conversation with a running Safest deal, its agent assigned. */
async function dealThread() {
  const seeded = await seedListing();
  const opened = await openConversation({
    listingId: seeded.listing.id,
    buyerId: seeded.buyer.id,
  });
  if (!opened.ok) throw new Error(opened.reason);
  const created = await createDeal({
    listingId: seeded.listing.id,
    buyerId: seeded.buyer.id,
    mode: "SAFEST",
    acceptedRevenueRisk: true,
  });
  if (!created.ok) throw new Error(created.reason);
  const staff = await seedUser("MODERATOR");
  const assign = (agentId: string) =>
    assignAgent({
      orderId: created.orderId,
      agentId,
      agentEmail: "transfers@channeladda.test",
      agentBrand: "Channel Adda Transfers",
      byUserId: staff.id,
    });
  const assigned = await assign(seeded.agent.id);
  if (!assigned.ok) throw new Error(assigned.reason);
  // An attachment in the thread, to check the file is guarded too.
  await db.message.create({
    data: {
      conversationId: opened.id,
      senderId: seeded.buyer.id,
      body: "Here is the analytics screenshot.",
      attachmentUrl: `/uploads/${KEY}`,
      attachmentKind: "IMAGE",
    },
  });
  return {
    ...seeded,
    staff,
    assign,
    orderId: created.orderId,
    conversationId: opened.id,
    agentUser: asUser(seeded.agent.id, "AGENT", seeded.agent.name),
  };
}

/** Everything that would let an agent into the thread, at once. */
async function reach(t: { conversationId: string }, user: CurrentUser) {
  const [thread, fingerprint, file, inbox] = await Promise.all([
    getThread(t.conversationId, user),
    threadFingerprint(t.conversationId, user),
    canReadUpload(KEY, user),
    listThreads(user),
  ]);
  return {
    thread: thread !== null,
    fingerprint: fingerprint !== null,
    file,
    inbox: inbox.some((row) => row.id === t.conversationId),
  };
}

const ALL = { thread: true, fingerprint: true, file: true, inbox: true };
const NONE = { thread: false, fingerprint: false, file: false, inbox: false };

test(
  "the assigned agent reads and posts in their deal's conversation",
  withCleanDb(async () => {
    const t = await dealThread();
    expect(await reach(t, t.agentUser)).toEqual(ALL);
    expect((await getThread(t.conversationId, t.agentUser))?.viewerRole).toBe(
      "agent",
    );

    const sent = await sendMessage({
      conversationId: t.conversationId,
      sender: t.agentUser,
      body: "I will send the owner invite this afternoon.",
    });
    expect(sent.ok).toBe(true);

    // Both sides see it as the agent's, under the agent's own name.
    const seen = await getThread(t.conversationId, asUser(t.buyer.id));
    const last = seen?.messages.at(-1);
    expect(last).toMatchObject({
      senderRole: "agent",
      senderName: t.agent.name,
      fromStaff: false,
    });
  }),
);

test(
  "an agent of another deal sees nothing",
  withCleanDb(async () => {
    const t = await dealThread();
    const other = await seedUser("AGENT");
    const outsider = asUser(other.id, "AGENT");
    expect(await reach(t, outsider)).toEqual(NONE);
    expect(
      await sendMessage({
        conversationId: t.conversationId,
        sender: outsider,
        body: "Hello?",
      }),
    ).toEqual({ ok: false, reason: "not-allowed" });
  }),
);

test(
  "reassignment, a role change, a ban and the deal ending each end access",
  withCleanDb(async () => {
    // Reassignment: the new agent is in, the old one is out.
    const a = await dealThread();
    const next = await seedUser("AGENT");
    const moved = await a.assign(next.id);
    if (!moved.ok) throw new Error(moved.reason);
    expect(await reach(a, a.agentUser)).toEqual(NONE);
    expect(await reach(a, asUser(next.id, "AGENT"))).toEqual(ALL);

    // A role change, read from the database rather than the session.
    const b = await dealThread();
    await db.user.update({ where: { id: b.agent.id }, data: { role: "USER" } });
    expect(await reach(b, b.agentUser)).toEqual(NONE);

    // A ban, likewise.
    const c = await dealThread();
    await db.user.update({
      where: { id: c.agent.id },
      data: { bannedAt: new Date() },
    });
    expect(await reach(c, c.agentUser)).toEqual(NONE);

    // The deal ending.
    const d = await dealThread();
    const ended = await resolveDeal({
      orderId: d.orderId,
      to: "CANCELLED",
      byUserId: d.staff.id,
      note: "Never paid.",
    });
    if (!ended.ok) throw new Error(ended.reason);
    expect(await reach(d, d.agentUser)).toEqual(NONE);
  }),
);

test(
  "an agent whose deal ended gets no fingerprint",
  withCleanDb(async () => {
    const t = await dealThread();
    expect(
      await threadFingerprint(t.conversationId, t.agentUser),
    ).not.toBeNull();
    await resolveDeal({
      orderId: t.orderId,
      to: "CANCELLED",
      byUserId: t.staff.id,
      note: "Never paid.",
    });
    expect(await threadFingerprint(t.conversationId, t.agentUser)).toBeNull();
  }),
);

test(
  "a later deal in the same conversation is hidden from the earlier deal's agent",
  withCleanDb(async () => {
    const t = await dealThread();
    // The first deal lapses unpaid; the buyer opens a second with another agent.
    await db.order.update({
      where: { id: t.orderId },
      data: { createdAt: new Date(Date.now() - 49 * 3_600_000) },
    });
    expect(await expireStaleDeals()).toBe(1);
    const second = await createDeal({
      listingId: t.listing.id,
      buyerId: t.buyer.id,
      mode: "FASTEST",
      acceptedRevenueRisk: true,
    });
    if (!second.ok) throw new Error(second.reason);
    const next = await seedUser("AGENT");
    const placed = await assignAgent({
      orderId: second.orderId,
      agentId: next.id,
      agentEmail: "transfers@channeladda.test",
      agentBrand: "Channel Adda Transfers",
      byUserId: t.staff.id,
    });
    if (!placed.ok) throw new Error(placed.reason);

    expect(await reach(t, t.agentUser)).toEqual(NONE);
    expect(await reach(t, asUser(next.id, "AGENT"))).toEqual(ALL);
  }),
);

test(
  "an agent can write in a closed conversation and is never flagged",
  withCleanDb(async () => {
    const t = await dealThread();
    await db.conversation.update({
      where: { id: t.conversationId },
      data: { closedAt: new Date() },
    });

    const sent = await sendMessage({
      conversationId: t.conversationId,
      sender: t.agentUser,
      body: "Reach me on telegram @agentdesk if the invite fails.",
    });
    expect(sent.ok).toBe(true);
    // The filter still applies to what the agent writes...
    const last = (await getThread(t.conversationId, t.agentUser))?.messages.at(
      -1,
    );
    expect(last?.body).not.toContain("@agentdesk");
    // ...but an agent is not who flagging is for.
    const thread = await db.conversation.findUniqueOrThrow({
      where: { id: t.conversationId },
    });
    expect(thread.flaggedAt).toBeNull();
  }),
);
