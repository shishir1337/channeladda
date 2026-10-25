import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { threadHref } from "@/lib/thread-href";
import { markThreadRead, openConversation } from "@/server/messages";
import type { CurrentUser } from "@/server/session";
import { seedListing, withCleanDb } from "@/test/db";

/**
 * A conversation's notifications stop counting once the thread has been
 * read: QA found the chat reply still in the bell after answering it.
 */

function asUser(id: string): CurrentUser {
  return {
    id,
    email: "someone@example.test",
    name: "Someone",
    image: null,
    emailVerified: true,
    role: "USER",
    slug: null,
    banned: false,
  };
}

const note = (userId: string, href: string | null) =>
  db.notification.create({
    data: { userId, kind: "MESSAGE", title: "New message", body: "Hi", href },
  });

test(
  "reading a conversation reads the notifications that point at it",
  withCleanDb(async () => {
    const { listing, buyer } = await seedListing();
    const opened = await openConversation({
      listingId: listing.id,
      buyerId: buyer.id,
    });
    if (!opened.ok) throw new Error(opened.reason);

    const reply = await note(buyer.id, threadHref(opened.id, listing.id));
    const bare = await note(buyer.id, threadHref(opened.id));
    // Another thread whose id begins the same way, and a deal: left alone.
    const lookalike = await note(buyer.id, `${threadHref(opened.id)}x`);
    const deal = await note(buyer.id, "/dashboard/deals/abc");

    await markThreadRead(opened.id, asUser(buyer.id));

    const after = await db.notification.findMany({
      where: { userId: buyer.id },
      select: { id: true, readAt: true },
    });
    const read = new Set(after.filter((n) => n.readAt).map((n) => n.id));
    expect(read.has(reply.id)).toBe(true);
    expect(read.has(bare.id)).toBe(true);
    expect(read.has(lookalike.id)).toBe(false);
    expect(read.has(deal.id)).toBe(false);
  }),
);
