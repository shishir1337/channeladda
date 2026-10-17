import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { postEvent } from "@/server/chat-events";
import { assignAgent, createDeal } from "@/server/deals";
import {
  countUnreadThreads,
  listThreads,
  markThreadRead,
  openConversation,
  sendMessage,
} from "@/server/messages";
import type { CurrentUser } from "@/server/session";
import { seedListing, seedUser, withCleanDb } from "@/test/db";

/**
 * With the deal's agent in a conversation there are three readers, and each
 * keeps their own place. One `readAt` on each message used to serve both
 * sides, which only worked with two: whoever opened the thread first marked
 * the agent's message read for the other.
 */

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

async function threeReaders() {
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
  const assigned = await assignAgent({
    orderId: created.orderId,
    agentId: seeded.agent.id,
    agentEmail: "transfers@channeladda.test",
    agentBrand: "Channel Adda Transfers",
    byUserId: staff.id,
  });
  if (!assigned.ok) throw new Error(assigned.reason);

  const buyer = asUser(seeded.buyer.id, "USER", seeded.buyer.name);
  const seller = asUser(seeded.seller.id, "USER", seeded.seller.name);
  const agent = asUser(seeded.agent.id, "AGENT", seeded.agent.name);
  // Everybody starts caught up, so each test sees only what it adds.
  for (const reader of [buyer, seller, agent]) {
    await markThreadRead(opened.id, reader);
  }
  return { id: opened.id, buyer, seller, agent, staff };
}

const unreadIn = async (id: string, reader: CurrentUser) =>
  (await listThreads(reader)).find((row) => row.id === id)?.unread ?? 0;

test(
  "one reader opening the thread clears nothing for the others",
  withCleanDb(async () => {
    const t = await threeReaders();
    await sendMessage({
      conversationId: t.id,
      sender: t.agent,
      body: "Invite sent to the seller.",
    });

    expect(await unreadIn(t.id, t.buyer)).toBe(1);
    expect(await unreadIn(t.id, t.seller)).toBe(1);
    expect(await unreadIn(t.id, t.agent)).toBe(0);

    // The buyer reads it. The seller still has it to read.
    await markThreadRead(t.id, t.buyer);
    expect(await unreadIn(t.id, t.buyer)).toBe(0);
    expect(await unreadIn(t.id, t.seller)).toBe(1);
    expect(await countUnreadThreads(t.seller.id)).toBe(1);
    expect(await countUnreadThreads(t.buyer.id)).toBe(0);

    // A reply from the seller is unread for the buyer and for the agent.
    await sendMessage({
      conversationId: t.id,
      sender: t.seller,
      body: "Accepted it.",
    });
    expect(await unreadIn(t.id, t.agent)).toBe(1);
    expect(await countUnreadThreads(t.agent.id)).toBe(1);
  }),
);

test(
  "an agent's message notifies both sides",
  withCleanDb(async () => {
    const t = await threeReaders();
    await db.notification.deleteMany();
    await sendMessage({
      conversationId: t.id,
      sender: t.agent,
      body: "Invite sent.",
    });
    const told = await db.notification.findMany({
      where: { kind: "MESSAGE" },
      select: { userId: true, href: true },
    });
    expect(told.map((n) => n.userId).sort()).toEqual(
      [t.buyer.id, t.seller.id].sort(),
    );
  }),
);

test(
  "a staff note notifies both sides",
  withCleanDb(async () => {
    // Before, only the buyer heard: "the other side" of a staff note was
    // worked out as if staff were the seller.
    const t = await threeReaders();
    await db.notification.deleteMany();
    await sendMessage({
      conversationId: t.id,
      sender: asUser(t.staff.id, "MODERATOR"),
      body: "Please keep the deal on Channel Adda.",
    });
    const told = await db.notification.findMany({
      where: { kind: "MESSAGE" },
      select: { userId: true },
    });
    expect(told.map((n) => n.userId).sort()).toEqual(
      [t.agent.id, t.buyer.id, t.seller.id].sort(),
    );
  }),
);

test(
  "system events never make a thread unread",
  withCleanDb(async () => {
    const t = await threeReaders();
    await postEvent(db, {
      conversationId: t.id,
      kind: "EVENT",
      event: { type: "payment-received", reference: "CA-55555" },
      senderId: null,
    });
    for (const reader of [t.buyer, t.seller, t.agent]) {
      expect(await unreadIn(t.id, reader)).toBe(0);
      expect(await countUnreadThreads(reader.id)).toBe(0);
    }
  }),
);
