import { expect, test } from "vitest";
import { db } from "@/lib/db";
import {
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
      sender: asUser(buyer.id),
      body: "",
      attachmentKey: `message/${"a".repeat(32)}.png`,
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
      (latest.attachmentExpiresAt!.getTime() - Date.now()) / 3_600_000;
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
        sender: asUser(buyer.id),
        body: "   ",
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
      sender: asUser(buyer.id),
      body: "here it is, whatsapp me on +1 555 0100",
      attachmentKey: `message/${"b".repeat(32)}.png`,
    });

    const latest = await db.message.findFirstOrThrow({
      where: { conversationId: opened.id, attachmentUrl: { not: null } },
    });
    expect(latest.body).not.toContain("555 0100");
    expect(latest.redactedAt).not.toBeNull();
  }),
);
