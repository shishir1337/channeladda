import { expect, test } from "vitest";
import { eventText } from "@/lib/chat-events";
import { db } from "@/lib/db";
import { templateFor } from "@/lib/deal-templates";
import {
  advanceStep,
  assignAgent,
  createDeal,
  expireStaleDeals,
  recordOpeningPayment,
  resolveDeal,
} from "@/server/deals";
import { openConversation, sendMessage } from "@/server/messages";
import { createOffer } from "@/server/offers";
import type { CurrentUser } from "@/server/session";
import { creditDeposit, payFromWallet } from "@/server/wallet";
import { passHold, seedListing, seedUser, withCleanDb } from "@/test/db";

/**
 * Every change to a deal leaves a line in its conversation, so the thread
 * reads as the deal's record whichever page somebody acted from.
 */

const HOUR = 3_600_000;
type Mode = "SAFEST" | "FASTEST";

function asUser(id: string, name = "Someone"): CurrentUser {
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

async function open(
  mode: Mode,
  seeded?: Awaited<ReturnType<typeof seedListing>>,
) {
  const s = seeded ?? (await seedListing());
  const created = await createDeal({
    listingId: s.listing.id,
    buyerId: s.buyer.id,
    mode,
    acceptedRevenueRisk: true,
  });
  if (!created.ok) throw new Error(created.reason);
  const order = await db.order.findUniqueOrThrow({
    where: { id: created.orderId },
  });
  return { ...s, order, orderId: created.orderId };
}

async function assign(orderId: string, agentId: string) {
  const staff = await seedUser("MODERATOR");
  const result = await assignAgent({
    orderId,
    agentId,
    agentEmail: "transfers@channeladda.test",
    agentBrand: "Channel Adda Transfers",
    byUserId: staff.id,
  });
  if (!result.ok) throw new Error(result.reason);
}

const events = (orderId: string) =>
  db.message.findMany({
    where: { orderId, kind: "EVENT" },
    orderBy: { createdAt: "asc" },
    select: { body: true, senderId: true, conversationId: true },
  });

test(
  "opening a deal from the listing page makes its conversation",
  withCleanDb(async () => {
    const { buyer, order } = await open("SAFEST");
    expect(order.conversationId).not.toBeNull();

    const first = await db.message.findFirstOrThrow({
      where: { conversationId: order.conversationId ?? "" },
      orderBy: { createdAt: "asc" },
    });
    expect(first).toMatchObject({
      kind: "EVENT",
      orderId: order.id,
      senderId: buyer.id,
      body: eventText({
        type: "deal-opened",
        name: buyer.name,
        mode: "SAFEST",
        reference: order.reference,
        priceCents: order.priceUsd,
      }),
    });
  }),
);

test(
  "the other buyers' offers close with an event",
  withCleanDb(async () => {
    const seeded = await seedListing();
    const other = await seedUser();
    const offerFrom = async (buyerId: string) => {
      const made = await createOffer({
        buyerId,
        listingId: seeded.listing.id,
        amountCents: 8_000,
        message: null,
        expiryHours: 48,
      });
      if (!made.ok) throw new Error(made.reason);
      return made.value;
    };
    const theirs = await offerFrom(other.id);
    const mine = await offerFrom(seeded.buyer.id);

    // The buyer stops haggling and buys at the asking price. Opening the
    // deal closes nothing: only paying for it does.
    const deal = await open("SAFEST", seeded);
    await recordOpeningPayment(deal.orderId, "pay-1", "USDT");

    const there = await db.message.findMany({
      where: { conversationId: theirs.conversationId, kind: "EVENT" },
    });
    expect(there.map((m) => m.body)).toEqual([
      eventText({ type: "offer-auto-declined", amountCents: 8_000 }),
    ]);
    const told = await db.notification.findMany({
      where: { userId: other.id },
    });
    expect(told.map((n) => n.href)).toEqual([
      `/dashboard/messages/${theirs.conversationId}`,
    ]);

    // Their own offer is not "declined" by somebody else: they superseded it.
    const here = await db.message.findMany({
      where: { conversationId: mine.conversationId, kind: "EVENT" },
    });
    expect(here.some((m) => /another buyer/.test(m.body))).toBe(false);
    const own = await db.offer.findUniqueOrThrow({
      where: { id: mine.offerId },
    });
    expect(own.status).toBe("WITHDRAWN");
  }),
);

test(
  "payment, agent, steps and the hold each write one event",
  withCleanDb(async () => {
    const { orderId, order, buyer, seller, agent } = await open("FASTEST");
    await assign(orderId, agent.id);
    await recordOpeningPayment(orderId, `pay-${orderId}`, "USDT");

    const actors = { buyer, seller, agent } as const;
    // Up to the buyer confirming manager access, which starts the hold.
    const steps = templateFor("FASTEST").filter(
      (s) => s.position >= 2 && s.position <= 3,
    );
    for (const step of steps) {
      const who = actors[step.actor as keyof typeof actors];
      const done = await advanceStep({
        orderId,
        position: step.position,
        userId: who.id,
      });
      if (!done.ok) throw new Error(`${step.position}: ${done.reason}`);
    }
    const after = await db.order.findUniqueOrThrow({ where: { id: orderId } });

    expect(await events(orderId)).toEqual(
      [
        {
          body: eventText({
            type: "deal-opened",
            name: buyer.name,
            mode: "FASTEST",
            reference: order.reference,
            priceCents: order.priceUsd,
          }),
          senderId: buyer.id,
        },
        {
          body: eventText({ type: "agent-joined", agentName: agent.name }),
          senderId: null,
        },
        {
          body: eventText({
            type: "payment-received",
            reference: order.reference,
          }),
          senderId: null,
        },
        ...steps.map((step) => ({
          body: eventText({
            type: "step-done",
            name: actors[step.actor as keyof typeof actors].name,
            label: step.label,
          }),
          senderId: actors[step.actor as keyof typeof actors].id,
        })),
        {
          body: eventText({
            type: "hold-started",
            until: after.holdUntil ?? new Date(0),
          }),
          senderId: null,
        },
      ].map((e) => ({ ...e, conversationId: order.conversationId })),
    );
  }),
);

test(
  "finishing through the last step writes the outcome",
  withCleanDb(async () => {
    const { orderId, buyer, seller, agent } = await open("FASTEST");
    await assign(orderId, agent.id);
    await recordOpeningPayment(orderId, `pay-${orderId}`, "USDT");
    const actors = { buyer, seller, agent } as const;
    for (const step of templateFor("FASTEST")) {
      if (step.position < 2) continue;
      await passHold(orderId);
      const done = await advanceStep({
        orderId,
        position: step.position,
        userId: actors[step.actor as keyof typeof actors].id,
      });
      if (!done.ok) throw new Error(`${step.position}: ${done.reason}`);
    }
    const last = (await events(orderId)).at(-1);
    expect(last?.body).toBe(
      eventText({ type: "deal-ended", outcome: "Deal completed" }),
    );
  }),
);

test(
  "reassigning the agent says the invite address changed",
  withCleanDb(async () => {
    const { orderId, agent } = await open("SAFEST");
    await assign(orderId, agent.id);
    const next = await seedUser("AGENT");
    await assign(orderId, next.id);

    const last = (await events(orderId)).at(-1);
    expect(last?.body).toBe(
      eventText({ type: "agent-changed", agentName: next.name }),
    );
  }),
);

test(
  "paying from the balance writes the event after the payment commits",
  withCleanDb(async () => {
    const { orderId, order, buyer } = await open("SAFEST");
    await creditDeposit(buyer.id, order.totalUsd, `dep-${orderId}`, "USDT");

    expect(await payFromWallet(orderId, buyer.id)).toEqual({ ok: true });
    const paid = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(paid.status).toBe("AWAITING_CUSTODY");
    expect((await events(orderId)).at(-1)?.body).toBe(
      eventText({ type: "payment-received", reference: order.reference }),
    );
  }),
);

test(
  "a message arriving during a balance payment does not refuse it",
  withCleanDb(async () => {
    // The payment is a Serializable transaction that reports a lost race as
    // "not enough balance". A chat line written inside it would make every
    // message landing at the same moment look like that.
    for (let round = 0; round < 5; round++) {
      const seeded = await seedListing();
      const opened = await openConversation({
        listingId: seeded.listing.id,
        buyerId: seeded.buyer.id,
      });
      if (!opened.ok) throw new Error(opened.reason);
      const { orderId, order } = await open("SAFEST", seeded);
      await creditDeposit(
        seeded.buyer.id,
        order.totalUsd,
        `dep-${orderId}`,
        "USDT",
      );

      const [paid] = await Promise.all([
        payFromWallet(orderId, seeded.buyer.id),
        sendMessage({
          conversationId: opened.id,
          listingId: seeded.listing.id,
          sender: asUser(seeded.seller.id, seeded.seller.name),
          body: "Sending the invite as soon as it clears.",
        }),
      ]);
      expect(paid).toEqual({ ok: true });
    }
  }),
);

test(
  "a message arriving during agent assignment does not report the cap",
  withCleanDb(async () => {
    for (let round = 0; round < 5; round++) {
      const seeded = await seedListing();
      const opened = await openConversation({
        listingId: seeded.listing.id,
        buyerId: seeded.buyer.id,
      });
      if (!opened.ok) throw new Error(opened.reason);
      const { orderId } = await open("SAFEST", seeded);
      const staff = await seedUser("MODERATOR");

      const [assigned] = await Promise.all([
        assignAgent({
          orderId,
          agentId: seeded.agent.id,
          agentEmail: "transfers@channeladda.test",
          agentBrand: "Channel Adda Transfers",
          byUserId: staff.id,
        }),
        sendMessage({
          conversationId: opened.id,
          listingId: seeded.listing.id,
          sender: asUser(seeded.buyer.id, seeded.buyer.name),
          body: "Who is the agent on this one?",
        }),
      ]);
      expect(assigned).toEqual({ ok: true });
    }
  }),
);

test(
  "a dispute and every ending write an event",
  withCleanDb(async () => {
    const { orderId, buyer } = await open("FASTEST");
    await recordOpeningPayment(orderId, `pay-${orderId}`, "USDT");
    const finance = await seedUser("FINANCE");

    const raised = await resolveDeal({
      orderId,
      to: "DISPUTED",
      byUserId: buyer.id,
      note: "The seller stopped answering.",
    });
    if (!raised.ok) throw new Error(raised.reason);
    const refunded = await resolveDeal({
      orderId,
      to: "REFUNDED",
      byUserId: finance.id,
      note: "No transfer was ever started.",
    });
    if (!refunded.ok) throw new Error(refunded.reason);

    const lines = (await events(orderId)).slice(-2);
    expect(lines).toMatchObject([
      {
        body: eventText({ type: "dispute-raised", name: buyer.name }),
        senderId: buyer.id,
      },
      {
        body: eventText({ type: "deal-ended", outcome: "Buyer refunded" }),
        // Staff decide as Channel Adda, not as a named person.
        senderId: null,
      },
    ]);
    expect(lines.some((l) => l.senderId === finance.id)).toBe(false);
  }),
);

test(
  "a lapsed payment window writes an event",
  withCleanDb(async () => {
    const { orderId, order } = await open("SAFEST");
    await db.order.update({
      where: { id: orderId },
      data: { createdAt: new Date(Date.now() - 49 * HOUR) },
    });
    expect(await expireStaleDeals()).toBe(1);

    expect((await events(orderId)).at(-1)).toMatchObject({
      body: eventText({ type: "payment-lapsed", reference: order.reference }),
      senderId: null,
    });
  }),
);

test(
  "a closed conversation does not stop the deal",
  withCleanDb(async () => {
    // Closing a chat moderates what people say. It must not freeze a deal
    // that has money or a channel in the air.
    const seeded = await seedListing();
    const opened = await openConversation({
      listingId: seeded.listing.id,
      buyerId: seeded.buyer.id,
    });
    if (!opened.ok) throw new Error(opened.reason);
    await db.conversation.update({
      where: { id: opened.id },
      data: { closedAt: new Date() },
    });

    const { orderId, order } = await open("SAFEST", seeded);
    expect(order.conversationId).toBe(opened.id);
    await assign(orderId, seeded.agent.id);
    await recordOpeningPayment(orderId, `pay-${orderId}`, "USDT");
    expect(
      await advanceStep({ orderId, position: 2, userId: seeded.seller.id }),
    ).toEqual({ ok: true });
    expect((await events(orderId)).length).toBe(4);
  }),
);

test(
  "a dispute staff raise is Channel Adda's, not the moderator's",
  withCleanDb(async () => {
    // Staff speak as Channel Adda: a buyer should not learn which moderator
    // is reading their deal, from a message or from a line about a dispute.
    const { orderId } = await open("FASTEST");
    await recordOpeningPayment(orderId, `pay-${orderId}`, "USDT");
    const moderator = await db.user.create({
      data: {
        email: "jane.moderator@example.test",
        name: "Jane Moderator",
        role: "MODERATOR",
      },
    });

    const raised = await resolveDeal({
      orderId,
      to: "DISPUTED",
      byUserId: moderator.id,
      note: "Checking the transfer.",
    });
    if (!raised.ok) throw new Error(raised.reason);

    const last = (await events(orderId)).at(-1);
    expect(last?.body).toBe(
      eventText({ type: "dispute-raised", name: "Channel Adda" }),
    );
    expect(last?.body).not.toContain("Jane");
    expect(last?.senderId).toBeNull();
  }),
);
