import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { createDeal } from "@/server/deals";
import { listThreads, openConversation } from "@/server/messages";
import type { CurrentUser } from "@/server/session";
import { seedListing, withCleanDb } from "@/test/db";

// The owner: "in messages, show all the running deals at the top". A deal is
// what somebody has to act on; a question about another listing can wait
// below it, however recently it was asked.

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

test(
  "conversations with a running deal come first, tagged with the deal",
  withCleanDb(async () => {
    const dealt = await seedListing();
    const deal = await createDeal({
      listingId: dealt.listing.id,
      buyerId: dealt.buyer.id,
      mode: "SAFEST",
    });
    if (!deal.ok) throw new Error(deal.reason);

    // A newer conversation about another listing, with no deal in it.
    const other = await seedListing();
    const asked = await openConversation({
      listingId: other.listing.id,
      buyerId: dealt.buyer.id,
    });
    if (!asked.ok) throw new Error(asked.reason);
    await db.conversation.update({
      where: { id: asked.id },
      data: { lastMessageAt: new Date(Date.now() + 60_000) },
    });

    const inbox = await listThreads(asUser(dealt.buyer.id));

    expect(inbox.map((row) => row.id)).toEqual([deal.conversationId, asked.id]);
    expect(inbox[0].deal).toEqual({
      reference: deal.reference,
      mode: "SAFEST",
    });
    expect(inbox[1].deal).toBeNull();
  }),
);

test(
  "a deal that has ended no longer lifts its conversation",
  withCleanDb(async () => {
    const dealt = await seedListing();
    const deal = await createDeal({
      listingId: dealt.listing.id,
      buyerId: dealt.buyer.id,
      mode: "FASTEST",
    });
    if (!deal.ok) throw new Error(deal.reason);
    await db.order.update({
      where: { id: deal.orderId },
      data: { status: "CANCELLED" },
    });

    const [row] = await listThreads(asUser(dealt.buyer.id));

    expect(row.id).toBe(deal.conversationId);
    expect(row.deal).toBeNull();
  }),
);
