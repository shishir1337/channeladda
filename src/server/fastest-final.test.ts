import { expect, test } from "vitest";
import { db } from "@/lib/db";
import {
  advanceStep,
  assignAgent,
  balanceOf,
  createDeal,
  getDealFor,
  recordOpeningPayment,
  resolveDeal,
} from "@/server/deals";
import { passHold, seedListing, seedUser, withCleanDb } from "@/test/db";

/**
 * A Fastest deal, as the owner set it out on 2026-10-20:
 *
 *   1. the buyer pays the price and our fee, which Channel Adda holds;
 *   2. the seller sends our agent an owner invite;
 *   3. our agent accepts and invites the buyer — the holding period starts;
 *   4. the seller makes our agent primary owner;
 *   5. our agent confirms it, and the seller is paid;
 *   6. our agent makes the buyer primary owner, and the deal is complete.
 */

async function paidFastest(
  options: { agent?: boolean; priceUsd?: number } = {},
) {
  const seeded = await seedListing(
    options.priceUsd ? { priceUsd: options.priceUsd } : {},
  );
  const created = await createDeal({
    listingId: seeded.listing.id,
    buyerId: seeded.buyer.id,
    mode: "FASTEST",
    acceptedRevenueRisk: true,
    handoverTo: "buyer-channel@example.test",
  });
  if (!created.ok) throw new Error(created.reason);
  const { orderId } = created;
  if (options.agent !== false) {
    await db.order.update({
      where: { id: orderId },
      data: {
        agentId: seeded.agent.id,
        agentEmail: "transfers@channeladda.test",
        agentBrand: "Channel Adda Transfers",
      },
    });
  }
  await recordOpeningPayment(orderId, `pay-${orderId}`, "USDT");
  return { ...seeded, orderId };
}

async function step(orderId: string, position: number, userId: string) {
  const done = await advanceStep({ orderId, position, userId });
  if (!done.ok) throw new Error(`step ${position}: ${done.reason}`);
}

/** Steps 2 to 5: the seller paid, the channel with our agent. */
async function toCustody(t: Awaited<ReturnType<typeof paidFastest>>) {
  await step(t.orderId, 2, t.seller.id);
  await step(t.orderId, 3, t.agent.id);
  await passHold(t.orderId);
  await step(t.orderId, 4, t.seller.id);
  await step(t.orderId, 5, t.agent.id);
}

test(
  "the seller is paid when our agent is primary owner, and the deal ends with the buyer's",
  withCleanDb(async () => {
    const t = await paidFastest();

    await step(t.orderId, 2, t.seller.id);
    await step(t.orderId, 3, t.agent.id);
    const holding = await db.order.findUniqueOrThrow({
      where: { id: t.orderId },
    });
    expect(holding.status).toBe("AWAITING_HANDOVER");
    // YouTube's holding period is the 7 days Google makes a new owner wait.
    const days =
      ((holding.holdUntil?.getTime() ?? 0) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);

    // Nobody makes our agent primary owner before the holding period ends.
    expect(
      await advanceStep({
        orderId: t.orderId,
        position: 4,
        userId: t.seller.id,
      }),
    ).toEqual({ ok: false, reason: "on-hold" });

    await passHold(t.orderId);
    await step(t.orderId, 4, t.seller.id);
    expect(await balanceOf(t.seller.id)).toBe(0);

    await step(t.orderId, 5, t.agent.id);
    const custody = await db.order.findUniqueOrThrow({
      where: { id: t.orderId },
      include: { listing: true },
    });
    expect(custody.status).toBe("IN_CUSTODY");
    expect(custody.custodyAt).not.toBeNull();
    // Paid now, the whole price (the seller fee is 0 in tests).
    expect(await balanceOf(t.seller.id)).toBe(10_000);
    // The deal is not over: our agent still has to hand the channel on.
    expect(custody.completedAt).toBeNull();
    expect(custody.listing.status).toBe("RESERVED");
    expect((await getDealFor(t.buyer.id, t.orderId))?.listingOnSale).toBe(true);

    await step(t.orderId, 6, t.agent.id);
    const done = await db.order.findUniqueOrThrow({
      where: { id: t.orderId },
      include: { listing: true },
    });
    expect(done.status).toBe("COMPLETED");
    expect(done.handoverAt).not.toBeNull();
    expect(done.listing.status).toBe("SOLD");
    // Paid once, not twice.
    expect(await balanceOf(t.seller.id)).toBe(10_000);
    // Its public page is gone, so the deal no longer links to it.
    expect((await getDealFor(t.buyer.id, t.orderId))?.listingOnSale).toBe(
      false,
    );
    expect(
      await db.ledgerEntry.count({
        where: { orderId: t.orderId, kind: "BUYER_FEE" },
      }),
    ).toBe(1);
    // The platform's own rows net to the fee it earned.
    const platform = await db.ledgerEntry.aggregate({
      where: { orderId: t.orderId, userId: null },
      _sum: { amountUsd: true },
    });
    expect(platform._sum.amountUsd).toBe(300);
  }),
);

test(
  "a paid deal with no agent asks Channel Adda for one, not the seller for their step",
  withCleanDb(async () => {
    const moderator = await seedUser("MODERATOR");
    const t = await paidFastest({ agent: false });

    // Nobody to invite yet, so the seller is not told it is their move,
    // and cannot record an invite either.
    expect(
      await db.notification.count({
        where: {
          userId: t.seller.id,
          title: { startsWith: "Invite the agent as owner" },
        },
      }),
    ).toBe(0);
    expect(
      await advanceStep({
        orderId: t.orderId,
        position: 2,
        userId: t.seller.id,
      }),
    ).toEqual({ ok: false, reason: "no-agent" });

    // Whoever can take it hears that it is waiting.
    for (const userId of [moderator.id, t.agent.id]) {
      const asked = await db.notification.findMany({
        where: { userId, title: { contains: "needs an agent" } },
      });
      expect(asked).toHaveLength(1);
      expect(asked[0].href).toBe("/admin/deals");
    }

    // Once one is on it, the seller is told.
    const staff = await seedUser("SUPERADMIN");
    expect(
      await assignAgent({
        orderId: t.orderId,
        agentId: t.agent.id,
        agentEmail: "transfers@channeladda.test",
        agentBrand: "Channel Adda Transfers",
        byUserId: staff.id,
      }),
    ).toEqual({ ok: true });
    expect(
      await db.notification.count({
        where: {
          userId: t.seller.id,
          title: { startsWith: "Invite the agent as owner" },
        },
      }),
    ).toBe(1);
  }),
);

test(
  "the buyer presses nothing after paying",
  withCleanDb(async () => {
    const t = await paidFastest();
    await step(t.orderId, 2, t.seller.id);
    for (const position of [3, 5, 6]) {
      expect(
        await advanceStep({ orderId: t.orderId, position, userId: t.buyer.id }),
      ).toMatchObject({ ok: false });
    }
  }),
);

test(
  "the seller is told when they have been paid",
  withCleanDb(async () => {
    const t = await paidFastest();
    await toCustody(t);
    const told = await db.notification.findMany({
      where: { userId: t.seller.id, title: { contains: "paid" } },
    });
    expect(told).toHaveLength(1);
    expect(told[0].body).toMatch(/Channel Adda wallet/);
    // And the chat says so, without the amount.
    const lines = await db.message.findMany({
      where: { orderId: t.orderId, kind: "EVENT" },
    });
    expect(lines.some((m) => /seller has been paid/i.test(m.body))).toBe(true);
  }),
);

test(
  "once the seller is paid the deal cannot be refunded, only finished",
  withCleanDb(async () => {
    const t = await paidFastest();
    const finance = await seedUser("FINANCE");
    await toCustody(t);
    const raised = await resolveDeal({
      orderId: t.orderId,
      to: "DISPUTED",
      byUserId: t.buyer.id,
      note: "Not primary owner yet.",
    });
    expect(raised).toEqual({ ok: true });
    expect(
      await resolveDeal({
        orderId: t.orderId,
        to: "REFUNDED",
        byUserId: finance.id,
        note: "Refund.",
      }),
    ).toEqual({ ok: false, reason: "seller-paid" });
    expect(
      await resolveDeal({
        orderId: t.orderId,
        to: "COMPLETED",
        byUserId: finance.id,
        note: "Handed over.",
      }),
    ).toEqual({ ok: true });
    // Finishing it from the dispute pays nothing more.
    expect(await balanceOf(t.seller.id)).toBe(10_000);
  }),
);

test(
  "before our agent is primary owner a dispute cannot be decided by paying the seller",
  withCleanDb(async () => {
    const t = await paidFastest();
    const finance = await seedUser("FINANCE");
    await step(t.orderId, 2, t.seller.id);
    await step(t.orderId, 3, t.agent.id);
    await resolveDeal({
      orderId: t.orderId,
      to: "DISPUTED",
      byUserId: t.buyer.id,
      note: "Something is off.",
    });
    expect(
      await resolveDeal({
        orderId: t.orderId,
        to: "COMPLETED",
        byUserId: finance.id,
        note: "Pay out.",
      }),
    ).toEqual({ ok: false, reason: "not-handed-over" });
    // A refund is still possible: the money is with us.
    expect(
      await resolveDeal({
        orderId: t.orderId,
        to: "REFUNDED",
        byUserId: finance.id,
        note: "Refund.",
      }),
    ).toEqual({ ok: true });
    expect(await balanceOf(t.buyer.id)).toBe(10_300);
  }),
);

test(
  "paying the seller and handing over each need a second approval above the threshold",
  withCleanDb(async () => {
    const t = await paidFastest({ priceUsd: 600_000 });
    await step(t.orderId, 2, t.seller.id);
    await step(t.orderId, 3, t.agent.id);
    await passHold(t.orderId);
    await step(t.orderId, 4, t.seller.id);
    expect(
      await advanceStep({
        orderId: t.orderId,
        position: 5,
        userId: t.agent.id,
      }),
    ).toEqual({ ok: false, reason: "needs-approval" });
    const second = await seedUser("MODERATOR");
    const approved = await advanceStep({
      orderId: t.orderId,
      position: 5,
      userId: t.agent.id,
      approvedById: second.id,
    });
    expect(approved).toEqual({ ok: true });
    expect(
      await advanceStep({
        orderId: t.orderId,
        position: 6,
        userId: t.agent.id,
      }),
    ).toEqual({ ok: false, reason: "needs-approval" });
  }),
);

test(
  "the seller never sees the buyer's account, and our agent does",
  withCleanDb(async () => {
    const t = await paidFastest();
    expect((await getDealFor(t.seller.id, t.orderId))?.handoverTo).toBeNull();
    expect((await getDealFor(t.agent.id, t.orderId))?.handoverTo).toBe(
      "buyer-channel@example.test",
    );
    // The seller does see our agent's, which is what they invite.
    expect((await getDealFor(t.seller.id, t.orderId))?.agentEmail).toBe(
      "transfers@channeladda.test",
    );
  }),
);

test(
  "a fastest channel counts toward the agent's cap",
  withCleanDb(async () => {
    const first = await paidFastest();
    await step(first.orderId, 2, first.seller.id);
    await step(first.orderId, 3, first.agent.id);

    const second = await paidFastest({ agent: false });
    // After the second seed, which writes the test settings afresh.
    await db.platformSettings.update({
      where: { id: "singleton" },
      data: { maxHoldsPerAgent: 1 },
    });
    const { clearSettingsCache } = await import("@/server/settings");
    clearSettingsCache();
    const staff = await seedUser("SUPERADMIN");
    expect(
      await assignAgent({
        orderId: second.orderId,
        agentId: first.agent.id,
        agentEmail: "transfers@channeladda.test",
        agentBrand: "Channel Adda Transfers",
        byUserId: staff.id,
      }),
    ).toEqual({ ok: false, reason: "cap-reached" });
  }),
);
