import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { loadPanelInput } from "@/server/deal-panel";
import { createDeal, expireStaleDeals } from "@/server/deals";
import { openConversation } from "@/server/messages";
import { acceptOffer, createOffer } from "@/server/offers";
import { seedListing, withCleanDb } from "@/test/db";

/**
 * What the panel is worked out from, read for one conversation.
 */

const HOUR = 3_600_000;

test(
  "the panel reads the newest offer and the newest deal of this conversation",
  withCleanDb(async () => {
    const { listing, buyer } = await seedListing();
    const opened = await openConversation({
      listingId: listing.id,
      buyerId: buyer.id,
    });
    if (!opened.ok) throw new Error(opened.reason);

    // A first deal that lapsed unpaid, then a second still waiting.
    const first = await createDeal({
      listingId: listing.id,
      buyerId: buyer.id,
      mode: "SAFEST",
      acceptedRevenueRisk: true,
    });
    if (!first.ok) throw new Error(first.reason);
    await db.order.update({
      where: { id: first.orderId },
      data: { createdAt: new Date(Date.now() - 49 * HOUR) },
    });
    await expireStaleDeals();
    const second = await createDeal({
      listingId: listing.id,
      buyerId: buyer.id,
      mode: "FASTEST",
      acceptedRevenueRisk: true,
    });
    if (!second.ok) throw new Error(second.reason);

    const input = await loadPanelInput(opened.id, "buyer");
    // Still on sale: an unpaid deal reserves nothing.
    expect(input).toMatchObject({
      viewer: "buyer",
      listingStatus: "LIVE",
      askingCents: 10_000,
      latestOffer: null,
      heldOffer: null,
      deal: {
        id: second.orderId,
        mode: "FASTEST",
        status: "AWAITING_PAYMENT",
        nextStep: { position: 1, actor: "buyer" },
        holdUntil: null,
      },
    });
  }),
);

test(
  "a held acceptance says when it lapses",
  withCleanDb(async () => {
    const { listing, buyer, seller } = await seedListing();
    const made = await createOffer({
      buyerId: buyer.id,
      listingId: listing.id,
      amountCents: 8_000,
      message: null,
      expiryHours: 48,
    });
    if (!made.ok) throw new Error(made.reason);
    expect(
      (await acceptOffer(made.value.offerId, seller.id, "seller")).ok,
    ).toBe(true);
    const accepted = await db.offer.findUniqueOrThrow({
      where: { id: made.value.offerId },
    });

    const input = await loadPanelInput(made.value.conversationId, "seller");
    expect(input?.heldOffer).toEqual({
      id: made.value.offerId,
      amountCents: 8_000,
      heldUntil: new Date((accepted.respondedAt?.getTime() ?? 0) + 48 * HOUR),
    });
    expect(input?.latestOffer).toMatchObject({
      id: made.value.offerId,
      effectiveStatus: "ACCEPTED",
    });
  }),
);

test(
  "an unknown conversation gives nothing",
  withCleanDb(async () => {
    expect(await loadPanelInput("no-such-thread", "buyer")).toBeNull();
  }),
);
