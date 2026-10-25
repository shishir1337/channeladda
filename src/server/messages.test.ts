import { expect, test } from "vitest";
import { db } from "@/lib/db";
import {
  askSeller,
  OPENING_MESSAGE,
  openConversation,
  sendMessage,
} from "@/server/messages";
import type { CurrentUser } from "@/server/session";
import { seedListing, withCleanDb } from "@/test/db";

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

test(
  "a new thread opens with a question from the buyer",
  withCleanDb(async () => {
    // An empty thread tells the seller somebody looked and nothing more, and
    // leaves the buyer a blank box to work out what to say into.
    const { listing, buyer } = await seedListing();
    const opened = await openConversation({
      listingId: listing.id,
      buyerId: buyer.id,
    });
    if (!opened.ok) throw new Error(opened.reason);

    const messages = await db.message.findMany({
      where: { conversationId: opened.id },
    });
    expect(messages).toHaveLength(1);
    expect(messages[0].body).toBe(OPENING_MESSAGE);
    expect(messages[0].senderId).toBe(buyer.id);
    expect(messages[0].fromStaff).toBe(false);
  }),
);

test(
  "reopening an existing thread does not send a second opener",
  withCleanDb(async () => {
    const { listing, buyer } = await seedListing();
    const first = await openConversation({
      listingId: listing.id,
      buyerId: buyer.id,
    });
    const second = await openConversation({
      listingId: listing.id,
      buyerId: buyer.id,
    });
    if (!first.ok || !second.ok) throw new Error("setup");

    expect(second.id).toBe(first.id);
    expect(
      await db.message.count({ where: { conversationId: first.id } }),
    ).toBe(1);
  }),
);

test(
  "a seller cannot open a thread on their own listing",
  withCleanDb(async () => {
    const { listing, seller } = await seedListing();
    expect(
      await openConversation({ listingId: listing.id, buyerId: seller.id }),
    ).toMatchObject({ ok: false, reason: "own-listing" });
  }),
);

/**
 * An upload row for a chat attachment.
 *
 * sendMessage checks that the sender is the one who uploaded the file, so a
 * test that attaches a key out of thin air is testing a case the product
 * refuses — and used to pass because nothing checked.
 */
async function uploadedBy(userId: string, key: string) {
  await db.upload.create({
    data: {
      key,
      uploaderId: userId,
      kind: "message",
      bytes: 10,
      contentType: key.endsWith(".png") ? "image/png" : "video/mp4",
    },
  });
  return key;
}
test(
  "an attachment can be sent with no words",
  withCleanDb(async () => {
    const { listing, buyer } = await seedListing();
    const opened = await openConversation({
      listingId: listing.id,
      buyerId: buyer.id,
    });
    if (!opened.ok) throw new Error(opened.reason);

    const result = await sendMessage({
      conversationId: opened.id,
      listingId: listing.id,
      sender: asUser(buyer.id),
      body: "",
      attachmentKey: await uploadedBy(
        buyer.id,
        `message/${"a".repeat(32)}.png`,
      ),
    });
    expect(result.ok).toBe(true);

    const latest = await db.message.findFirstOrThrow({
      where: { conversationId: opened.id, attachmentUrl: { not: null } },
    });
    expect(latest.attachmentKind).toBe("IMAGE");
    // Read from disk rather than taken from the caller, so a test with no
    // file behind the key records null — which is the honest answer.
    expect(latest.attachmentBytes).toBeNull();
    // Stamped on the way in, so a later policy change cannot retroactively
    // delete what people already sent.
    expect(latest.attachmentExpiresAt).not.toBeNull();
    const hours =
      ((latest.attachmentExpiresAt?.getTime() ?? 0) - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(47);
    expect(hours).toBeLessThan(49);
  }),
);

test(
  "a message with neither words nor a file is still refused",
  withCleanDb(async () => {
    const { listing, buyer } = await seedListing();
    const opened = await openConversation({
      listingId: listing.id,
      buyerId: buyer.id,
    });
    if (!opened.ok) throw new Error(opened.reason);

    expect(
      await sendMessage({
        conversationId: opened.id,
        listingId: listing.id,
        sender: asUser(buyer.id),
        body: "   ",
      }),
    ).toMatchObject({ ok: false, reason: "empty" });
  }),
);

test(
  "direction marks are taken out of a message, and other scripts kept",
  withCleanDb(async () => {
    const { listing, buyer } = await seedListing();
    const opened = await openConversation({
      listingId: listing.id,
      buyerId: buyer.id,
    });
    if (!opened.ok) throw new Error(opened.reason);

    const sent = await sendMessage({
      conversationId: opened.id,
      listingId: listing.id,
      sender: asUser(buyer.id),
      body: "Offer \u202E005$\u202C stands — مرحبا 👍",
    });
    expect(sent).toMatchObject({ ok: true });

    const latest = await db.message.findFirstOrThrow({
      where: { conversationId: opened.id, senderId: buyer.id },
      orderBy: { createdAt: "desc" },
    });
    expect(latest.body).toBe("Offer 005$ stands — مرحبا 👍");

    // Nothing but marks is nothing at all.
    expect(
      await sendMessage({
        conversationId: opened.id,
        listingId: listing.id,
        sender: asUser(buyer.id),
        body: "\u202E\u2066\u200F",
      }),
    ).toMatchObject({ ok: false, reason: "empty" });
  }),
);

test(
  "contact details are still stripped when a file is attached",
  withCleanDb(async () => {
    // The attachment path must not become a way around the redaction that
    // keeps deals on the platform.
    const { listing, buyer } = await seedListing();
    const opened = await openConversation({
      listingId: listing.id,
      buyerId: buyer.id,
    });
    if (!opened.ok) throw new Error(opened.reason);

    await sendMessage({
      conversationId: opened.id,
      listingId: listing.id,
      sender: asUser(buyer.id),
      body: "here it is, whatsapp me on +1 555 0100",
      attachmentKey: await uploadedBy(
        buyer.id,
        `message/${"b".repeat(32)}.png`,
      ),
    });

    const latest = await db.message.findFirstOrThrow({
      where: { conversationId: opened.id, attachmentUrl: { not: null } },
    });
    expect(latest.body).not.toContain("555 0100");
    expect(latest.redactedAt).not.toBeNull();
  }),
);

// ------------------------------------------------ asking in the buyer's words

test(
  "the buyer's own question opens the thread, in their words",
  withCleanDb(async () => {
    // "Ask the seller a question" used to send a fixed opener on one click,
    // which the buyer could not change before it went.
    const { listing, buyer } = await seedListing();
    const asked = await askSeller({
      listingId: listing.id,
      buyer: asUser(buyer.id),
      question: "  Is most of the audience in the US?  ",
    });
    if (!asked.ok) throw new Error(asked.reason);

    const messages = await db.message.findMany({
      where: { conversationId: asked.id },
    });
    expect(messages.map((m) => m.body)).toEqual([
      "Is most of the audience in the US?",
    ]);
    expect(messages[0].senderId).toBe(buyer.id);
  }),
);

test(
  "a question with contact details is filtered like any other message",
  withCleanDb(async () => {
    const { listing, buyer } = await seedListing();
    const asked = await askSeller({
      listingId: listing.id,
      buyer: asUser(buyer.id),
      question: "Call me on 01712345678 to talk price",
    });
    if (!asked.ok) throw new Error(asked.reason);
    const [message] = await db.message.findMany({
      where: { conversationId: asked.id },
    });
    expect(message.body).not.toContain("01712345678");
  }),
);

test(
  "an empty question opens nothing",
  withCleanDb(async () => {
    const { listing, buyer } = await seedListing();
    expect(
      await askSeller({
        listingId: listing.id,
        buyer: asUser(buyer.id),
        question: "   ",
      }),
    ).toEqual({ ok: false, reason: "empty" });
    expect(await db.conversation.count()).toBe(0);
  }),
);

test(
  "asking again in an existing thread adds the question to it",
  withCleanDb(async () => {
    const { listing, buyer } = await seedListing();
    const first = await askSeller({
      listingId: listing.id,
      buyer: asUser(buyer.id),
      question: "First question",
    });
    const second = await askSeller({
      listingId: listing.id,
      buyer: asUser(buyer.id),
      question: "Second question",
    });
    if (!first.ok || !second.ok) throw new Error("setup");
    expect(second.id).toBe(first.id);
    expect(
      await db.message.count({ where: { conversationId: first.id } }),
    ).toBe(2);
  }),
);
