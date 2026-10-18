import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { dealPanelState, type PanelViewer } from "@/lib/deal-panel";
import { loadPanelInput } from "@/server/deal-panel";
import {
  advanceStep,
  assignAgent,
  createDeal,
  recordOpeningPayment,
} from "@/server/deals";
import { openConversation, sendMessage } from "@/server/messages";
import {
  acceptOffer,
  counterOffer,
  createOffer,
  proposePrice,
} from "@/server/offers";
import type { CurrentUser } from "@/server/session";
import { creditDeposit, payFromWallet } from "@/server/wallet";
import { passHold, seedListing, seedUser, withCleanDb } from "@/test/db";

/**
 * A whole deal, run the way the conversation runs it.
 *
 * Only the functions the chat's buttons call, and after each move: the line
 * it left in the conversation, and what the panel now offers each of the
 * three people in it. The record and the panel together are the feature; a
 * step that worked but drew the wrong panel would leave someone stuck.
 */

function asUser(id: string, name: string): CurrentUser {
  return {
    id,
    email: "someone@example.test",
    name,
    image: null,
    emailVerified: true,
    role: "USER",
    slug: null,
    banned: false,
  };
}

async function panelsOf(conversationId: string) {
  const out: Record<
    PanelViewer,
    ReturnType<typeof dealPanelState>
  > = {} as never;
  for (const viewer of ["buyer", "seller", "agent"] as const) {
    const input = await loadPanelInput(conversationId, viewer);
    if (!input) throw new Error("no panel input");
    out[viewer] = dealPanelState(input);
  }
  return out;
}

const kinds = async (id: string) =>
  Object.fromEntries(
    Object.entries(await panelsOf(id)).map(([who, s]) => [
      who,
      "yourMove" in s ? `${s.kind}:${s.yourMove ? "mine" : "theirs"}` : s.kind,
    ]),
  );

const lastLine = (conversationId: string) =>
  db.message.findFirstOrThrow({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    select: { kind: true, body: true, senderId: true },
  });

test(
  "a Safest deal from first question to completion, in the conversation",
  withCleanDb(async () => {
    const { listing, buyer, seller, agent } = await seedListing();
    const staff = await seedUser("MODERATOR");

    // Rafi asks.
    const opened = await openConversation({
      listingId: listing.id,
      buyerId: buyer.id,
    });
    if (!opened.ok) throw new Error(opened.reason);
    const id = opened.id;
    await sendMessage({
      conversationId: id,
      sender: asUser(seller.id, seller.name),
      body: "Still available. Revenue is steady.",
    });
    expect(await kinds(id)).toEqual({
      buyer: "buy",
      seller: "propose",
      agent: "unavailable",
    });

    // Rafi offers $80; Nadia counters $90; Rafi accepts.
    const offer = await createOffer({
      buyerId: buyer.id,
      listingId: listing.id,
      amountCents: 8_000,
      message: "Can you do this?",
      expiryHours: 48,
    });
    if (!offer.ok) throw new Error(offer.reason);
    expect((await lastLine(id)).kind).toBe("OFFER");
    expect(await kinds(id)).toMatchObject({
      buyer: "offer-waiting-on-them",
      seller: "offer-your-turn",
    });

    const counter = await counterOffer({
      offerId: offer.value.offerId,
      responderId: seller.id,
      as: "seller",
      amountCents: 9_000,
      message: null,
      expiryHours: 48,
    });
    if (!counter.ok) throw new Error(counter.reason);
    expect(await kinds(id)).toMatchObject({
      buyer: "offer-your-turn",
      seller: "offer-waiting-on-them",
    });

    expect(
      (await acceptOffer(counter.value.offerId, buyer.id, "buyer")).ok,
    ).toBe(true);
    expect((await lastLine(id)).kind).toBe("EVENT");
    const held = (await panelsOf(id)).buyer;
    expect(held).toMatchObject({ kind: "start-deal", priceCents: 9_000 });
    expect((await panelsOf(id)).seller.kind).toBe("waiting-to-start");

    // He starts a Safest deal at the agreed price and pays from his balance.
    const deal = await createDeal({
      listingId: listing.id,
      buyerId: buyer.id,
      mode: "SAFEST",
      acceptedRevenueRisk: true,
    });
    if (!deal.ok) throw new Error(deal.reason);
    const order = await db.order.findUniqueOrThrow({
      where: { id: deal.orderId },
    });
    expect(order).toMatchObject({ priceUsd: 9_000, conversationId: id });
    expect(await kinds(id)).toMatchObject({
      buyer: "pay",
      seller: "waiting-for-payment",
    });

    await creditDeposit(buyer.id, order.totalUsd, `dep-${order.id}`, "USDT");
    expect(await payFromWallet(order.id, buyer.id)).toEqual({ ok: true });
    expect((await lastLine(id)).body).toContain(order.reference);

    const assigned = await assignAgent({
      orderId: order.id,
      agentId: agent.id,
      agentEmail: "transfers@channeladda.test",
      agentBrand: "Channel Adda Transfers",
      byUserId: staff.id,
    });
    if (!assigned.ok) throw new Error(assigned.reason);
    expect(await kinds(id)).toEqual({
      buyer: "step:theirs",
      seller: "step:mine",
      agent: "step:theirs",
    });

    const people = { buyer, seller, agent } as const;
    const step = async (position: number, by: keyof typeof people) => {
      const done = await advanceStep({
        orderId: order.id,
        position,
        userId: people[by].id,
      });
      if (!done.ok) throw new Error(`${position}: ${done.reason}`);
      expect(await lastLine(id)).toMatchObject({
        kind: "EVENT",
        senderId: people[by].id,
      });
    };

    await step(2, "seller");
    expect((await kinds(id)).agent).toBe("step:mine");
    await step(3, "agent");
    await step(4, "agent");
    expect((await kinds(id)).buyer).toBe("step:mine");
    await step(5, "buyer");
    // The buyer pays the price to Channel Adda — here from their balance —
    // and never to the seller. Nobody presses anything for it.
    expect((await kinds(id)).buyer).toBe("step:mine");
    await creditDeposit(buyer.id, 10_000, "top-chat", "USDT");
    expect(await payFromWallet(order.id, buyer.id)).toEqual({ ok: true });
    expect(await lastLine(id)).toMatchObject({ kind: "EVENT", senderId: null });
    expect((await lastLine(id)).body).toMatch(/to Channel Adda/);
    expect((await kinds(id)).agent).toBe("step:mine");
    await step(7, "agent");
    const done = await advanceStep({
      orderId: order.id,
      position: 8,
      userId: agent.id,
    });
    if (!done.ok) throw new Error(done.reason);

    expect(await kinds(id)).toEqual({
      buyer: "finished",
      seller: "finished",
      agent: "finished",
    });
    expect((await lastLine(id)).body).toBe("Deal completed");
  }),
);

test(
  "a Fastest deal from the seller's price to release",
  withCleanDb(async () => {
    const { listing, buyer, seller, agent } = await seedListing();
    const staff = await seedUser("MODERATOR");
    const opened = await openConversation({
      listingId: listing.id,
      buyerId: buyer.id,
    });
    if (!opened.ok) throw new Error(opened.reason);
    const id = opened.id;

    // Nadia puts a price to Rafi; he takes it.
    const price = await proposePrice({
      sellerId: seller.id,
      conversationId: id,
      amountCents: 9_500,
      message: "For you.",
      expiryHours: 48,
    });
    if (!price.ok) throw new Error(price.reason);
    expect(await kinds(id)).toMatchObject({
      buyer: "offer-your-turn",
      seller: "offer-waiting-on-them",
    });
    expect((await acceptOffer(price.value.offerId, buyer.id, "buyer")).ok).toBe(
      true,
    );
    expect((await panelsOf(id)).buyer).toMatchObject({
      kind: "start-deal",
      priceCents: 9_500,
    });

    const deal = await createDeal({
      listingId: listing.id,
      buyerId: buyer.id,
      mode: "FASTEST",
      acceptedRevenueRisk: true,
    });
    if (!deal.ok) throw new Error(deal.reason);
    await recordOpeningPayment(deal.orderId, `pay-${deal.orderId}`, "USDT");
    const assigned = await assignAgent({
      orderId: deal.orderId,
      agentId: agent.id,
      agentEmail: "transfers@channeladda.test",
      agentBrand: "Channel Adda Transfers",
      byUserId: staff.id,
    });
    if (!assigned.ok) throw new Error(assigned.reason);

    const people = { buyer, seller, agent } as const;
    for (const [position, by] of [
      [2, "seller"],
      [3, "agent"],
      [4, "seller"],
      [5, "buyer"],
    ] as const) {
      const done = await advanceStep({
        orderId: deal.orderId,
        position,
        userId: people[by].id,
      });
      if (!done.ok) throw new Error(`${position}: ${done.reason}`);
    }

    // The recovery hold: the release is the agent's step, and not yet theirs.
    expect((await kinds(id)).agent).toBe("step:theirs");
    expect((await lastLine(id)).body).toMatch(/^Recovery hold until/);

    await passHold(deal.orderId);
    expect((await kinds(id)).agent).toBe("step:mine");
    const released = await advanceStep({
      orderId: deal.orderId,
      position: 6,
      userId: agent.id,
    });
    if (!released.ok) throw new Error(released.reason);

    expect(await kinds(id)).toEqual({
      buyer: "finished",
      seller: "finished",
      agent: "finished",
    });
    const order = await db.order.findUniqueOrThrow({
      where: { id: deal.orderId },
    });
    expect(order).toMatchObject({ status: "COMPLETED", priceUsd: 9_500 });
  }),
);
