import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { purgeExpiredMedia, purgeOldMessages } from "@/server/chat-retention";
import { createDeal } from "@/server/deals";
import { seedListing, withCleanDb } from "@/test/db";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000);

async function thread(opts: { withDeal?: boolean; flagged?: boolean } = {}) {
  const seeded = await seedListing();
  const conversation = await db.conversation.create({
    data: {
      listingId: seeded.listing.id,
      buyerId: seeded.buyer.id,
      sellerId: seeded.seller.id,
      flaggedAt: opts.flagged ? new Date() : null,
      flagReason: opts.flagged ? "shared a phone number" : null,
    },
  });

  if (opts.withDeal) {
    const created = await createDeal({
      listingId: seeded.listing.id,
      buyerId: seeded.buyer.id,
      mode: "SAFEST",
    });
    if (!created.ok) throw new Error(created.reason);
    await db.conversation.update({
      where: { id: conversation.id },
      data: { orderId: created.orderId },
    });
  }

  return { ...seeded, conversationId: conversation.id };
}

async function message(
  conversationId: string,
  senderId: string,
  createdAt: Date,
  attachment?: { url: string; expiresAt: Date },
) {
  return db.message.create({
    data: {
      conversationId,
      senderId,
      body: "a message",
      createdAt,
      attachmentUrl: attachment?.url,
      attachmentKind: attachment ? "IMAGE" : undefined,
      attachmentBytes: attachment ? 1_024 : undefined,
      attachmentExpiresAt: attachment?.expiresAt,
    },
  });
}

// ------------------------------------------------------------------- media

test(
  "an attachment past its expiry is removed but the message stays",
  withCleanDb(async () => {
    const t = await thread();
    const m = await message(t.conversationId, t.buyer.id, hoursAgo(50), {
      url: "/uploads/message/old.png",
      expiresAt: hoursAgo(2),
    });

    expect(await purgeExpiredMedia()).toBe(1);

    const after = await db.message.findUniqueOrThrow({ where: { id: m.id } });
    // The words are the record of what was agreed; only the file goes.
    expect(after.body).toBe("a message");
    expect(after.attachmentUrl).toBeNull();
    expect(after.attachmentKind).toBeNull();
    expect(after.attachmentRemovedAt).not.toBeNull();
  }),
);

test(
  "an attachment inside its window is left alone",
  withCleanDb(async () => {
    const t = await thread();
    const m = await message(t.conversationId, t.buyer.id, hoursAgo(2), {
      url: "/uploads/message/fresh.png",
      expiresAt: new Date(Date.now() + 46 * 3_600_000),
    });

    expect(await purgeExpiredMedia()).toBe(0);
    expect(
      (await db.message.findUniqueOrThrow({ where: { id: m.id } }))
        .attachmentUrl,
    ).toBe("/uploads/message/fresh.png");
  }),
);

test(
  "media is removed from a deal thread once the deal is over",
  withCleanDb(async () => {
    // The 48 hour clock is about not hoarding people's screenshots, and that
    // applies to a deal as much as to a question — once the deal has ended
    // and nothing can be disputed any more. The message survives.
    const t = await thread({ withDeal: true });
    await db.order.updateMany({
      where: { listingId: t.listing.id },
      data: { status: "COMPLETED" },
    });
    const m = await message(t.conversationId, t.buyer.id, hoursAgo(50), {
      url: "/uploads/message/deal.png",
      expiresAt: hoursAgo(1),
    });

    expect(await purgeExpiredMedia()).toBe(1);
    const after = await db.message.findUniqueOrThrow({ where: { id: m.id } });
    expect(after.attachmentUrl).toBeNull();
    expect(after.body).toBe("a message");
  }),
);

test(
  "sweeping media twice does nothing the second time",
  withCleanDb(async () => {
    const t = await thread();
    await message(t.conversationId, t.buyer.id, hoursAgo(50), {
      url: "/uploads/message/once.png",
      expiresAt: hoursAgo(1),
    });
    expect(await purgeExpiredMedia()).toBe(1);
    expect(await purgeExpiredMedia()).toBe(0);
  }),
);

// ---------------------------------------------------------------- messages

test(
  "a plain thread's messages go after ten days",
  withCleanDb(async () => {
    const t = await thread();
    await message(t.conversationId, t.buyer.id, daysAgo(11));
    await message(t.conversationId, t.seller.id, daysAgo(11));

    expect(await purgeOldMessages()).toBe(2);
    expect(
      await db.message.count({ where: { conversationId: t.conversationId } }),
    ).toBe(0);
  }),
);

test(
  "messages inside ten days stay",
  withCleanDb(async () => {
    const t = await thread();
    await message(t.conversationId, t.buyer.id, daysAgo(9));
    expect(await purgeOldMessages()).toBe(0);
  }),
);

test(
  "a thread attached to a deal is never purged",
  withCleanDb(async () => {
    // This is the carve-out the owner asked for: the deal part stays. It is
    // also the only record a dispute can be settled from.
    const t = await thread({ withDeal: true });
    await message(t.conversationId, t.buyer.id, daysAgo(400));

    expect(await purgeOldMessages()).toBe(0);
    expect(
      await db.message.count({ where: { conversationId: t.conversationId } }),
    ).toBe(1);
  }),
);

test(
  "a flagged thread is never purged",
  withCleanDb(async () => {
    // Flagged means somebody tried to take the deal off the platform. That is
    // evidence about a person, and it outlives the conversation.
    const t = await thread({ flagged: true });
    await message(t.conversationId, t.buyer.id, daysAgo(400));
    expect(await purgeOldMessages()).toBe(0);
  }),
);

test(
  "a thread with an open dispute is never purged",
  withCleanDb(async () => {
    const t = await thread({ withDeal: true });
    const order = await db.order.findFirstOrThrow({
      where: { listingId: t.listing.id },
    });
    await db.dispute.create({
      data: {
        orderId: order.id,
        openedById: t.buyer.id,
        reason: "not as described",
        detail: "The subscriber count is a third of the listing.",
      },
    });
    await message(t.conversationId, t.buyer.id, daysAgo(400));
    expect(await purgeOldMessages()).toBe(0);
  }),
);

test(
  "a staff note is kept even in a plain thread",
  withCleanDb(async () => {
    // Staff wrote it to be found later. Deleting the moderator's own record
    // of what they told people would be the wrong thing to lose.
    const t = await thread();
    await db.message.create({
      data: {
        conversationId: t.conversationId,
        senderId: t.seller.id,
        body: "Channel Adda: do not move this off-platform.",
        fromStaff: true,
        createdAt: daysAgo(400),
      },
    });
    expect(await purgeOldMessages()).toBe(0);
  }),
);

test(
  "a purge leaves the conversation itself in place",
  withCleanDb(async () => {
    const t = await thread();
    await message(t.conversationId, t.buyer.id, daysAgo(11));
    await purgeOldMessages();
    expect(
      await db.conversation.findUnique({ where: { id: t.conversationId } }),
    ).not.toBeNull();
  }),
);

test(
  "only the old messages in a mixed thread go",
  withCleanDb(async () => {
    const t = await thread();
    const old = await message(t.conversationId, t.buyer.id, daysAgo(11));
    const recent = await message(t.conversationId, t.buyer.id, daysAgo(1));

    expect(await purgeOldMessages()).toBe(1);
    expect(await db.message.findUnique({ where: { id: old.id } })).toBeNull();
    expect(
      await db.message.findUnique({ where: { id: recent.id } }),
    ).not.toBeNull();
  }),
);

test(
  "an attachment in a live deal's thread outlives the 48-hour clock",
  withCleanDb(async () => {
    // The owner's rule was "clear messages after 10 days without the deal
    // part", and messages honour it. Media did not: a bank receipt posted in
    // a deal thread on day 0 was deleted on day 2, and a dispute raised on
    // day 4 had to be decided on a free-text reference with the receipt gone
    // — on a deal whose Google holds alone run seven days each.
    const t = await thread({ withDeal: true });
    await message(t.conversationId, t.buyer.id, hoursAgo(72), {
      url: `/uploads/message/${"e".repeat(32)}.png`,
      expiresAt: hoursAgo(24),
    });

    expect(await purgeExpiredMedia()).toBe(0);
  }),
);

test(
  "and so does one in a thread staff flagged",
  withCleanDb(async () => {
    const t = await thread({ flagged: true });
    await message(t.conversationId, t.buyer.id, hoursAgo(72), {
      url: `/uploads/message/${"f".repeat(32)}.png`,
      expiresAt: hoursAgo(24),
    });

    expect(await purgeExpiredMedia()).toBe(0);
  }),
);
