import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { threadHref } from "@/lib/thread-href";
import { purgeOldMessages } from "@/server/chat-retention";
import { loadPanelInput } from "@/server/deal-panel";
import { assignAgent, createDeal } from "@/server/deals";
import {
  askSeller,
  countUnreadThreads,
  getThread,
  listThreads,
  openConversation,
  resolveThreadAlias,
  sendMessage,
} from "@/server/messages";
import { createOffer, proposePrice } from "@/server/offers";
import type { CurrentUser } from "@/server/session";
import { threadFingerprint } from "@/server/thread-fingerprint";
import { canReadUpload } from "@/server/upload-access";
import { seedListing, seedUser, withCleanDb } from "@/test/db";

/**
 * One conversation per buyer and seller (the owner, 2026-10-26): a buyer
 * who comes back to the same seller finds the same thread, and every line
 * in it says which listing it is about.
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

async function listingOf(sellerId: string, title: string) {
  return db.listing.create({
    data: {
      slug: `listing-${randomUUID().slice(0, 8)}`,
      sellerId,
      platform: "YOUTUBE",
      handle: `@${title.toLowerCase().replace(/\W+/g, "-")}`,
      title,
      niche: "Tech",
      country: "Global",
      audience: 10_000,
      engagementBp: 50,
      ageYears: 2,
      priceUsd: 10_000,
      coverUrl: "/uploads/test-cover.png",
      avatarUrl: "/uploads/test-avatar.png",
      status: "LIVE",
    },
  });
}

/** One seller with two listings, and a buyer who asked about the first. */
async function pair() {
  const seeded = await seedListing();
  const second = await listingOf(seeded.seller.id, "Second channel");
  const opened = await openConversation({
    listingId: seeded.listing.id,
    buyerId: seeded.buyer.id,
  });
  if (!opened.ok) throw new Error(opened.reason);
  return {
    ...seeded,
    first: seeded.listing,
    second,
    id: opened.id,
    buyerUser: asUser(seeded.buyer.id, "USER", seeded.buyer.name),
    sellerUser: asUser(seeded.seller.id, "USER", seeded.seller.name),
  };
}

const lines = (conversationId: string) =>
  db.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    select: { listingId: true, kind: true, body: true, senderId: true },
  });

test(
  "a second listing from the same seller opens in the same conversation, with its own opener",
  withCleanDb(async () => {
    const t = await pair();
    const again = await openConversation({
      listingId: t.second.id,
      buyerId: t.buyer.id,
    });
    expect(again).toEqual({ ok: true, id: t.id });
    // Asking about the first again writes no second opener.
    expect(
      await openConversation({ listingId: t.first.id, buyerId: t.buyer.id }),
    ).toEqual({ ok: true, id: t.id });

    const written = await lines(t.id);
    expect(written.map((line) => line.listingId)).toEqual([
      t.first.id,
      t.second.id,
    ]);
    expect(written.every((line) => line.senderId === t.buyer.id)).toBe(true);
    expect(await db.conversation.count()).toBe(1);
  }),
);

test(
  "an offer and a deal on another listing land in the same conversation, each about its own listing",
  withCleanDb(async () => {
    const t = await pair();
    const offer = await createOffer({
      buyerId: t.buyer.id,
      listingId: t.second.id,
      amountCents: 8_000,
      message: null,
      expiryHours: 48,
    });
    if (!offer.ok) throw new Error(offer.reason);
    expect(offer.value.conversationId).toBe(t.id);

    const deal = await createDeal({
      listingId: t.first.id,
      buyerId: t.buyer.id,
      mode: "FASTEST",
    });
    if (!deal.ok) throw new Error(deal.reason);
    expect(deal.conversationId).toBe(t.id);

    const written = await lines(t.id);
    expect(written.find((line) => line.kind === "OFFER")?.listingId).toBe(
      t.second.id,
    );
    expect(written.find((line) => line.kind === "EVENT")?.listingId).toBe(
      t.first.id,
    );

    const thread = await getThread(t.id, t.buyerUser);
    expect(thread?.listings.map((listing) => listing.id)).toEqual([
      t.first.id,
      t.second.id,
    ]);
    expect(thread?.listings[1]).toMatchObject({
      id: t.second.id,
      title: "Second channel",
      priceCents: 10_000,
      onSale: true,
    });
  }),
);

test(
  "the seller buying from the buyer is a conversation of its own",
  withCleanDb(async () => {
    const t = await pair();
    const theirs = await listingOf(t.buyer.id, "Buyer's own channel");
    const back = await openConversation({
      listingId: theirs.id,
      buyerId: t.seller.id,
    });
    if (!back.ok) throw new Error(back.reason);
    expect(back.id).not.toBe(t.id);

    const row = await db.conversation.findUniqueOrThrow({
      where: { id: back.id },
    });
    expect(row).toMatchObject({ buyerId: t.seller.id, sellerId: t.buyer.id });
    // Each reads its own side.
    expect((await getThread(back.id, t.sellerUser))?.viewerRole).toBe("buyer");
    expect((await getThread(t.id, t.sellerUser))?.viewerRole).toBe("seller");
  }),
);

test(
  "a seller can put a price only on a listing already talked about here",
  withCleanDb(async () => {
    const t = await pair();
    const refused = await proposePrice({
      sellerId: t.seller.id,
      conversationId: t.id,
      listingId: t.second.id,
      amountCents: 9_000,
      message: null,
      expiryHours: 48,
    });
    expect(refused).toEqual({ ok: false, reason: "not-found" });

    const made = await proposePrice({
      sellerId: t.seller.id,
      conversationId: t.id,
      listingId: t.first.id,
      amountCents: 9_000,
      message: null,
      expiryHours: 48,
    });
    expect(made.ok).toBe(true);
    const card = (await lines(t.id)).find((line) => line.kind === "OFFER");
    expect(card?.listingId).toBe(t.first.id);
  }),
);

test(
  "a message goes only to a listing of this conversation; asking adds one of the same seller",
  withCleanDb(async () => {
    const t = await pair();
    const stranger = await seedListing();

    expect(
      await sendMessage({
        conversationId: t.id,
        listingId: t.second.id,
        sender: t.buyerUser,
        body: "And this one?",
      }),
    ).toEqual({ ok: false, reason: "not-allowed" });

    // Asking from the listing's page is how a listing joins the thread.
    const asked = await askSeller({
      listingId: t.second.id,
      buyer: t.buyerUser,
      question: "And is this one still for sale?",
    });
    expect(asked).toEqual({ ok: true, id: t.id });
    const sent = await sendMessage({
      conversationId: t.id,
      listingId: t.second.id,
      sender: t.sellerUser,
      body: "Yes, both are.",
    });
    expect(sent.ok).toBe(true);

    // Never one of somebody else's.
    expect(
      await sendMessage({
        conversationId: t.id,
        listingId: stranger.listing.id,
        sender: t.buyerUser,
        body: "What about this?",
      }),
    ).toEqual({ ok: false, reason: "not-allowed" });
    expect((await lines(t.id)).map((line) => line.listingId)).toEqual([
      t.first.id,
      t.second.id,
      t.second.id,
    ]);
  }),
);

test(
  "the contact filter lets through the handle of every listing in the conversation",
  withCleanDb(async () => {
    const t = await pair();
    await openConversation({ listingId: t.second.id, buyerId: t.buyer.id });
    const sent = await sendMessage({
      conversationId: t.id,
      listingId: t.first.id,
      sender: t.buyerUser,
      body: "Is @second-channel the bigger one?",
    });
    expect(sent).toEqual({ ok: true, redactedKinds: [] });
  }),
);

test(
  "the inbox row names every listing, the latest first, and each running deal",
  withCleanDb(async () => {
    const t = await pair();
    const deal = await createDeal({
      listingId: t.first.id,
      buyerId: t.buyer.id,
      mode: "SAFEST",
    });
    if (!deal.ok) throw new Error(deal.reason);
    await openConversation({ listingId: t.second.id, buyerId: t.buyer.id });

    const [row] = await listThreads(t.sellerUser);
    expect(row.id).toBe(t.id);
    expect(row.latestListingTitle).toBe("Second channel");
    expect([...row.listingTitles].sort()).toEqual(
      ["Second channel", "Test channel"].sort(),
    );
    expect(row.deals).toEqual([
      expect.objectContaining({ reference: deal.reference, mode: "SAFEST" }),
    ]);
    expect(row.withId).toBe(t.buyer.id);
    expect(row.role).toBe("seller");
  }),
);

test(
  "an old thread's link opens the conversation it became, for those in it only",
  withCleanDb(async () => {
    const t = await pair();
    await db.conversationAlias.create({
      data: { id: "old-thread", conversationId: t.id, listingId: t.second.id },
    });

    expect(await resolveThreadAlias("old-thread", t.buyerUser)).toEqual({
      conversationId: t.id,
      listingId: t.second.id,
    });
    expect(await resolveThreadAlias("old-thread", t.sellerUser)).not.toBeNull();
    const stranger = await seedUser();
    expect(
      await resolveThreadAlias("old-thread", asUser(stranger.id)),
    ).toBeNull();
    expect(await resolveThreadAlias("no-such-thread", t.buyerUser)).toBeNull();
  }),
);

test(
  "the panel is worked out per listing: two deals at once, each its own",
  withCleanDb(async () => {
    const t = await pair();
    const one = await createDeal({
      listingId: t.first.id,
      buyerId: t.buyer.id,
      mode: "SAFEST",
    });
    const two = await createDeal({
      listingId: t.second.id,
      buyerId: t.buyer.id,
      mode: "FASTEST",
    });
    if (!one.ok || !two.ok) throw new Error("no deal");

    const first = await loadPanelInput(t.id, t.first.id, "buyer");
    const second = await loadPanelInput(t.id, t.second.id, "buyer");
    expect(first?.deal).toMatchObject({ id: one.orderId, mode: "SAFEST" });
    expect(second?.deal).toMatchObject({ id: two.orderId, mode: "FASTEST" });
    // Not a listing of this conversation's seller: nothing.
    const stranger = await seedListing();
    expect(await loadPanelInput(t.id, stranger.listing.id, "buyer")).toBeNull();
  }),
);

test(
  "the 10-day clear-out keeps a deal's listing's lines and clears the rest",
  withCleanDb(async () => {
    const t = await pair();
    await openConversation({ listingId: t.second.id, buyerId: t.buyer.id });
    const deal = await createDeal({
      listingId: t.first.id,
      buyerId: t.buyer.id,
      mode: "SAFEST",
    });
    if (!deal.ok) throw new Error(deal.reason);
    await db.message.updateMany({
      where: { conversationId: t.id },
      data: { createdAt: new Date(Date.now() - 11 * 86_400_000) },
    });

    expect(await purgeOldMessages()).toBe(1);
    const left = await lines(t.id);
    expect(left.length).toBeGreaterThan(0);
    expect(left.every((line) => line.listingId === t.first.id)).toBe(true);
  }),
);

test(
  "another listing's change moves the poll's fingerprint",
  withCleanDb(async () => {
    const t = await pair();
    await openConversation({ listingId: t.second.id, buyerId: t.buyer.id });
    const before = await threadFingerprint(t.id, t.buyerUser);
    await db.listing.update({
      where: { id: t.second.id },
      data: { status: "PAUSED" },
    });
    expect(await threadFingerprint(t.id, t.buyerUser)).not.toBe(before);
  }),
);

// ------------------------------------------------------------------ agents

const KEY_ONE = "message/11111111111111111111111111111111.png";
const KEY_TWO = "message/22222222222222222222222222222222.png";

/**
 * Two deals in one conversation, each with its own agent: X on the first
 * listing, Y on the second. Each agent is there for their own deal only.
 */
async function twoAgents() {
  const t = await pair();
  await openConversation({ listingId: t.second.id, buyerId: t.buyer.id });
  const staff = await seedUser("MODERATOR");
  const [x, y] = await Promise.all([seedUser("AGENT"), seedUser("AGENT")]);
  const deals: string[] = [];
  for (const [listingId, agentId] of [
    [t.first.id, x.id],
    [t.second.id, y.id],
  ]) {
    const deal = await createDeal({
      listingId,
      buyerId: t.buyer.id,
      mode: "SAFEST",
    });
    if (!deal.ok) throw new Error(deal.reason);
    const placed = await assignAgent({
      orderId: deal.orderId,
      agentId,
      agentEmail: "transfers@channeladda.test",
      agentBrand: "Channel Adda Transfers",
      byUserId: staff.id,
    });
    if (!placed.ok) throw new Error(placed.reason);
    deals.push(deal.orderId);
  }
  // A photo about each listing.
  for (const [key, listingId] of [
    [KEY_ONE, t.first.id],
    [KEY_TWO, t.second.id],
  ]) {
    await db.message.create({
      data: {
        conversationId: t.id,
        listingId,
        senderId: t.buyer.id,
        body: "Here is the screenshot.",
        attachmentUrl: `/uploads/${key}`,
        attachmentKind: "IMAGE",
      },
    });
  }
  return {
    ...t,
    staff,
    deals,
    x: asUser(x.id, "AGENT", x.name),
    y: asUser(y.id, "AGENT", y.name),
  };
}

test(
  "an agent reads only the lines about their own deal's listing",
  withCleanDb(async () => {
    const t = await twoAgents();
    const seen = await getThread(t.id, t.x);
    expect(seen?.viewerRole).toBe("agent");
    expect(seen?.messages.length).toBeGreaterThan(0);
    expect(
      seen?.messages.every((message) => message.listingId === t.first.id),
    ).toBe(true);
    expect(seen?.listings.map((listing) => listing.id)).toEqual([t.first.id]);

    // The two sides and staff read all of it.
    for (const reader of [t.buyerUser, asUser(t.staff.id, "MODERATOR")]) {
      const all = await getThread(t.id, reader);
      expect(new Set(all?.messages.map((m) => m.listingId))).toEqual(
        new Set([t.first.id, t.second.id]),
      );
    }

    // Files, likewise.
    expect(await canReadUpload(KEY_ONE, t.x)).toBe(true);
    expect(await canReadUpload(KEY_TWO, t.x)).toBe(false);
    expect(await canReadUpload(KEY_TWO, t.y)).toBe(true);
  }),
);

test(
  "an agent writes only about their own deal's listing",
  withCleanDb(async () => {
    const t = await twoAgents();
    expect(
      await sendMessage({
        conversationId: t.id,
        listingId: t.second.id,
        sender: t.x,
        body: "About the other one…",
      }),
    ).toEqual({ ok: false, reason: "not-allowed" });
    const sent = await sendMessage({
      conversationId: t.id,
      listingId: t.first.id,
      sender: t.x,
      body: "I will send the invite today.",
    });
    expect(sent.ok).toBe(true);
  }),
);

test(
  "the other listing's lines never reach an agent's inbox, unread count, poll or bell",
  withCleanDb(async () => {
    const t = await twoAgents();
    // X has read everything there is to read.
    await db.conversationRead.create({
      data: { conversationId: t.id, userId: t.x.id, readAt: new Date() },
    });
    const [row] = await listThreads(t.x);
    const fingerprint = await threadFingerprint(t.id, t.x);
    await db.notification.deleteMany({});

    await new Promise((resolve) => setTimeout(resolve, 5));
    const said = await sendMessage({
      conversationId: t.id,
      listingId: t.second.id,
      sender: t.sellerUser,
      body: "Agent Y, the invite is sent.",
    });
    expect(said.ok).toBe(true);

    const [after] = await listThreads(t.x);
    expect(after.preview).toBe(row.preview);
    expect(after.preview).not.toContain("Agent Y");
    expect(after.lastMessageAt).toEqual(row.lastMessageAt);
    expect(after.unread).toBe(0);
    expect(after.deals.map((deal) => deal.reference)).toHaveLength(1);
    expect(after.listingTitles).toEqual(["Test channel"]);
    expect(await countUnreadThreads(t.x.id)).toBe(0);
    expect(await threadFingerprint(t.id, t.x)).toBe(fingerprint);
    expect(await db.notification.count({ where: { userId: t.x.id } })).toBe(0);

    // Y, whose listing it is, is told — and the bell opens the
    // conversation on that listing.
    const bell = await db.notification.findMany({ where: { userId: t.y.id } });
    expect(bell.map((n) => n.href)).toEqual([threadHref(t.id, t.second.id)]);
    const [theirs] = await listThreads(t.y);
    expect(theirs.preview).toContain("Agent Y");
    expect(theirs.unread).toBeGreaterThan(0);
  }),
);
