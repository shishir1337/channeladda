import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { createDeal, recordOpeningPayment } from "@/server/deals";
import { openConversation, sendMessage } from "@/server/messages";
import { createOffer } from "@/server/offers";
import type { CurrentUser } from "@/server/session";
import { threadFingerprint } from "@/server/thread-fingerprint";
import { seedListing, seedUser, withCleanDb } from "@/test/db";

/**
 * What an open conversation polls to learn whether anything changed.
 *
 * The thread's own last message is not enough: a listing paused, an offer
 * running out of time, a hold ending and a payment landing all change what
 * the page should show, and some of them write nothing in this thread.
 */

const HOUR = 3_600_000;

function asUser(id: string, role: CurrentUser["role"] = "USER"): CurrentUser {
  return {
    id,
    email: "someone@example.test",
    name: "Someone",
    image: null,
    emailVerified: true,
    role,
    slug: null,
    banned: false,
  };
}

async function thread() {
  const seeded = await seedListing();
  const opened = await openConversation({
    listingId: seeded.listing.id,
    buyerId: seeded.buyer.id,
  });
  if (!opened.ok) throw new Error(opened.reason);
  return { ...seeded, id: opened.id, viewer: asUser(seeded.buyer.id) };
}

test(
  "a new message changes it",
  withCleanDb(async () => {
    const t = await thread();
    const before = await threadFingerprint(t.id, t.viewer);
    await sendMessage({
      conversationId: t.id,
      sender: asUser(t.seller.id),
      body: "Still available.",
    });
    expect(await threadFingerprint(t.id, t.viewer)).not.toBe(before);
  }),
);

test(
  "the listing being paused changes it",
  withCleanDb(async () => {
    const t = await thread();
    const before = await threadFingerprint(t.id, t.viewer);
    await db.listing.update({
      where: { id: t.listing.id },
      data: { status: "PAUSED" },
    });
    expect(await threadFingerprint(t.id, t.viewer)).not.toBe(before);
  }),
);

test(
  "an offer running out of time changes it",
  withCleanDb(async () => {
    const t = await thread();
    const made = await createOffer({
      buyerId: t.buyer.id,
      listingId: t.listing.id,
      amountCents: 8_000,
      message: null,
      expiryHours: 48,
    });
    if (!made.ok) throw new Error(made.reason);

    // Nothing is written when an offer lapses; it reads as expired.
    const now = new Date();
    const before = await threadFingerprint(t.id, t.viewer, now);
    const later = new Date(now.getTime() + 49 * HOUR);
    expect(await threadFingerprint(t.id, t.viewer, later)).not.toBe(before);
  }),
);

test(
  "a recovery hold ending changes it",
  withCleanDb(async () => {
    const t = await thread();
    const created = await createDeal({
      listingId: t.listing.id,
      buyerId: t.buyer.id,
      mode: "FASTEST",
      acceptedRevenueRisk: true,
    });
    if (!created.ok) throw new Error(created.reason);
    const until = new Date(Date.now() + 14 * 24 * HOUR);
    await db.order.update({
      where: { id: created.orderId },
      data: { holdUntil: until },
    });

    const before = await threadFingerprint(t.id, t.viewer, new Date());
    const after = await threadFingerprint(
      t.id,
      t.viewer,
      new Date(until.getTime() + 1000),
    );
    expect(after).not.toBe(before);
  }),
);

test(
  "a payment being recorded changes it",
  withCleanDb(async () => {
    // The webhook's path: nobody in the conversation pressed anything.
    const t = await thread();
    const created = await createDeal({
      listingId: t.listing.id,
      buyerId: t.buyer.id,
      mode: "SAFEST",
      acceptedRevenueRisk: true,
    });
    if (!created.ok) throw new Error(created.reason);
    const before = await threadFingerprint(t.id, t.viewer);
    await recordOpeningPayment(
      created.orderId,
      `pay-${created.orderId}`,
      "USDT",
    );
    expect(await threadFingerprint(t.id, t.viewer)).not.toBe(before);
  }),
);

test(
  "nothing changing keeps it",
  withCleanDb(async () => {
    const t = await thread();
    const now = new Date();
    const first = await threadFingerprint(t.id, t.viewer, now);
    expect(first).not.toBeNull();
    expect(await threadFingerprint(t.id, t.viewer, now)).toBe(first);
    // The seller and staff read the same thread, so they poll it too.
    expect(await threadFingerprint(t.id, asUser(t.seller.id), now)).toBe(first);
    const moderator = await seedUser("MODERATOR");
    expect(
      await threadFingerprint(t.id, asUser(moderator.id, "MODERATOR"), now),
    ).toBe(first);
  }),
);

test(
  "a stranger gets no fingerprint",
  withCleanDb(async () => {
    const t = await thread();
    const stranger = await seedUser();
    expect(await threadFingerprint(t.id, asUser(stranger.id))).toBeNull();
    // An agent with no deal here is a stranger to it too.
    const agent = await seedUser("AGENT");
    expect(await threadFingerprint(t.id, asUser(agent.id, "AGENT"))).toBeNull();
    expect(await threadFingerprint("no-such-thread", t.viewer)).toBeNull();
  }),
);
