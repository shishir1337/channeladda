import { expect, test } from "vitest";
import { turnEmail } from "@/server/deal-notify";

/**
 * The email that reaches somebody who is not looking at the dashboard.
 *
 * A deal has two multi-day Google waits in the middle of it. Without this the
 * counterparty finds out it is their move by happening to log in, which on a
 * seven-day hold can be a week — and the notification rows the app has always
 * written are rendered nowhere at all.
 */
test("the subject says what is wanted, not that something happened", () => {
  const mail = turnEmail({
    name: "Hannah",
    reference: "CA-10001",
    listingTitle: "Monetized gaming channel",
    stepLabel: "Invite our agent as owner",
    mode: "SAFEST",
    href: "https://channeladda.com/dashboard/deals/abc",
  });

  // "Update on your deal" is what everybody's filters learn to ignore.
  expect(mail.subject).toBe("Your move: Invite our agent as owner (CA-10001)");
  expect(mail.body).toContain("Hannah");
  expect(mail.body).toContain("Monetized gaming channel");
  expect(mail.link).toBe("https://channeladda.com/dashboard/deals/abc");
});

test("it says which kind of deal", () => {
  const safest = turnEmail({
    name: "Hannah",
    reference: "CA-1",
    listingTitle: "A channel",
    stepLabel: "Pay the seller",
    mode: "SAFEST",
    href: "https://x/y",
  });
  expect(safest.body).toContain("Safest");
  // The price goes from the buyer to the seller once our agent holds the
  // channel; Channel Adda takes its fee and nothing else.
  expect(safest.body).toContain("the buyer then pays the seller directly");
  expect(safest.body).toContain("Channel Adda takes only its fee");

  const fastest = turnEmail({
    name: "Hannah",
    reference: "CA-2",
    listingTitle: "A channel",
    stepLabel: "Confirm primary ownership",
    mode: "FASTEST",
    href: "https://x/y",
  });
  expect(fastest.body).toContain("Fastest");
  expect(fastest.body).toContain("Channel Adda holds the buyer's payment");
  expect(fastest.body).toContain("primary owner");
  expect(fastest.body).not.toMatch(/pays the seller directly/);
});

test("a missing name does not produce 'Hi ,'", () => {
  const mail = turnEmail({
    name: null,
    reference: "CA-3",
    listingTitle: "A channel",
    stepLabel: "Do the thing",
    mode: "FASTEST",
    href: "https://x/y",
  });
  expect(mail.body).not.toContain("Hi ,");
  expect(mail.body.startsWith("Hi there")).toBe(true);
});

// ------------------------------------------------- who hears, and where to

import { db } from "@/lib/db";
import { templateFor } from "@/lib/deal-templates";
import { threadHref } from "@/lib/thread-href";
import {
  advanceStep,
  createDeal,
  expireStaleDeals,
  recordOpeningPayment,
} from "@/server/deals";
import { creditDeposit, payFromWallet } from "@/server/wallet";
import { passHold, seedListing, withCleanDb } from "@/test/db";

async function openDeal(mode: "SAFEST" | "FASTEST") {
  const seeded = await seedListing();
  const created = await createDeal({
    listingId: seeded.listing.id,
    buyerId: seeded.buyer.id,
    mode,
    acceptedRevenueRisk: true,
  });
  if (!created.ok) throw new Error(created.reason);
  const order = await db.order.findUniqueOrThrow({
    where: { id: created.orderId },
  });
  return { ...seeded, order };
}

test(
  "your-move notifications open the conversation",
  withCleanDb(async () => {
    const { order, seller, agent } = await openDeal("SAFEST");
    // With an agent on the deal, so the seller's step is theirs to take.
    await db.order.update({
      where: { id: order.id },
      data: {
        agentId: agent.id,
        agentEmail: "transfers@channeladda.test",
        agentBrand: "Channel Adda Transfers",
      },
    });
    await recordOpeningPayment(order.id, `pay-${order.id}`, "USDT");

    const turn = await db.notification.findFirstOrThrow({
      where: { userId: seller.id, kind: "ORDER" },
    });
    expect(turn.href).toBe(
      threadHref(order.conversationId ?? "", order.listingId),
    );
  }),
);

test(
  "finishing a deal through its last step tells all three",
  withCleanDb(async () => {
    const { order, buyer, seller, agent } = await openDeal("FASTEST");
    await db.order.update({
      where: { id: order.id },
      data: {
        agentId: agent.id,
        agentEmail: "transfers@channeladda.test",
        agentBrand: "Channel Adda Transfers",
      },
    });
    await recordOpeningPayment(order.id, `pay-${order.id}`, "USDT");
    const actors: Record<string, string> = {
      buyer: buyer.id,
      seller: seller.id,
      agent: agent.id,
    };
    for (const step of templateFor("FASTEST")) {
      if (step.position < 2) continue;
      await passHold(order.id);
      const done = await advanceStep({
        orderId: order.id,
        position: step.position,
        userId: actors[step.actor],
      });
      if (!done.ok) throw new Error(`${step.position}: ${done.reason}`);
    }

    const told = await db.notification.findMany({
      // "Deal complete", as success: it said "…has closed", word for word
      // what a cancelled deal says (QA, round 2).
      where: { title: { startsWith: "Deal complete — " } },
      select: { userId: true, href: true },
    });
    expect(told.map((n) => n.userId).sort()).toEqual(
      [buyer.id, seller.id, agent.id].sort(),
    );
    const href = (userId: string) =>
      told.find((n) => n.userId === userId)?.href;
    // Both sides to the conversation, where the record is.
    expect(href(buyer.id)).toBe(
      threadHref(order.conversationId ?? "", order.listingId),
    );
    expect(href(seller.id)).toBe(
      threadHref(order.conversationId ?? "", order.listingId),
    );
    // The agent's access to the conversation ends with the deal, so a link
    // there would be a 404. The deal page is theirs to open.
    expect(href(agent.id)).toBe(`/dashboard/deals/${order.id}`);
  }),
);

test(
  "a lapsed payment window tells both sides",
  withCleanDb(async () => {
    const { order, buyer, seller } = await openDeal("SAFEST");
    await db.order.update({
      where: { id: order.id },
      data: { createdAt: new Date(Date.now() - 49 * 3_600_000) },
    });
    expect(await expireStaleDeals()).toBe(1);

    const told = await db.notification.findMany({
      where: { title: { startsWith: "Payment window closed" } },
      select: { userId: true },
    });
    expect(told.map((n) => n.userId).sort()).toEqual(
      [buyer.id, seller.id].sort(),
    );
  }),
);

test(
  "paying from the balance tells the seller it is their move",
  withCleanDb(async () => {
    const { order, buyer, seller, agent } = await openDeal("SAFEST");
    await db.order.update({
      where: { id: order.id },
      data: {
        agentId: agent.id,
        agentEmail: "transfers@channeladda.test",
        agentBrand: "Channel Adda Transfers",
      },
    });
    await creditDeposit(buyer.id, order.totalUsd, `dep-${order.id}`, "USDT");
    expect(await payFromWallet(order.id, buyer.id)).toEqual({ ok: true });

    const turn = await db.notification.findFirst({
      where: { userId: seller.id, kind: "ORDER" },
    });
    expect(turn?.title).toContain("Invite our agent as owner");
  }),
);
