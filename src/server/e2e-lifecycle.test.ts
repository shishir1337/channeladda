import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { templateFor } from "@/lib/deal-templates";
import { purgeChat } from "@/server/chat-retention";
import { listDealActivity } from "@/server/deal-feed";
import {
  advanceStep,
  assignAgent,
  balanceOf,
  createDeal,
  expireStaleDeals,
  platformPositionFor,
  recordOpeningPayment,
} from "@/server/deals";
import { expireOffers } from "@/server/offers";
import {
  creditDeposit,
  getWallet,
  payFromWallet,
  requestWithdrawal,
  settleWithdrawal,
} from "@/server/wallet";
import { passHold, seedListing, seedUser, withCleanDb } from "@/test/db";

/**
 * The whole thing, end to end.
 *
 * Not a unit test: every other file here proves one rule in isolation, and
 * this one proves the rules compose. A deal touches the transition table, the
 * step templates, the ledger, the agent cap, the audit trail, the wallet and
 * the notifications, and each of those is correct on its own in a way that
 * says nothing about whether a real deal arrives at the right numbers.
 *
 * Both modes are driven to completion and the books are checked after, because
 * the money being right at the end is the only assertion a buyer or a seller
 * would recognise.
 */
async function drive(mode: "SAFEST" | "FASTEST", priceUsd = 10_000) {
  const seeded = await seedListing({ priceUsd });
  const staff = await seedUser("FINANCE");

  const created = await createDeal({
    listingId: seeded.listing.id,
    buyerId: seeded.buyer.id,
    mode,
  });
  if (!created.ok) throw new Error(`createDeal: ${created.reason}`);
  const { orderId } = created;

  const assigned = await assignAgent({
    orderId,
    agentId: seeded.agent.id,
    agentEmail: "transfers@channeladda.test",
    agentBrand: "Channel Adda Transfers",
    byUserId: staff.id,
  });
  if (!assigned.ok) throw new Error(`assignAgent: ${assigned.reason}`);

  await recordOpeningPayment(orderId, `cryptomus-${orderId}`, "USDT");

  const actors: Record<string, string> = {
    buyer: seeded.buyer.id,
    seller: seeded.seller.id,
    agent: seeded.agent.id,
  };

  for (const step of templateFor(mode)) {
    if (step.position < 2) continue;
    await passHold(orderId);
    const result = await advanceStep({
      orderId,
      position: step.position,
      userId: actors[step.actor],
      ...(mode === "SAFEST" && step.position === 6
        ? { paymentRef: "0xbuyerpaidseller" }
        : {}),
    });
    if (!result.ok) {
      throw new Error(
        `step ${step.position} (${step.label}): ${result.reason}`,
      );
    }
  }

  return { ...seeded, orderId, staff };
}

test(
  "a safest deal, from listing to completed",
  withCleanDb(async () => {
    const { orderId, listing, seller, buyer } = await drive("SAFEST");

    const order = await db.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { steps: { orderBy: { position: "asc" } } },
    });

    expect(order.status).toBe("COMPLETED");
    expect(order.steps.every((s) => s.completedAt !== null)).toBe(true);
    expect(order.steps).toHaveLength(9);
    expect(order.buyerPaymentRef).toBe("0xbuyerpaidseller");
    expect(
      (await db.listing.findUniqueOrThrow({ where: { id: listing.id } }))
        .status,
    ).toBe("SOLD");

    // The books: we charged a 3% fee and nothing else ever reached us.
    expect(await platformPositionFor(orderId)).toBe(300);
    expect(await balanceOf(seller.id)).toBe(0);
    expect(await balanceOf(buyer.id)).toBe(0);
    expect(
      await db.ledgerEntry.count({ where: { orderId, amountUsd: 10_000 } }),
    ).toBe(0);

    // Both sides were told whose move it was, all the way through.
    expect(
      await db.notification.count({ where: { userId: buyer.id } }),
    ).toBeGreaterThan(0);
    expect(
      await db.notification.count({ where: { userId: seller.id } }),
    ).toBeGreaterThan(0);

    // And the whole thing is on the admin feed.
    const feed = await listDealActivity();
    expect(feed.map((row) => row.action)).toContain("deal.completed");
    expect(feed.length).toBeGreaterThanOrEqual(10);
  }),
);

test(
  "a fastest deal, from listing to a withdrawn payout",
  withCleanDb(async () => {
    const { orderId, seller, staff } = await drive("FASTEST");

    expect(
      (await db.order.findUniqueOrThrow({ where: { id: orderId } })).status,
    ).toBe("COMPLETED");

    // Held 10,300, paid out 10,000, kept 300.
    expect(await platformPositionFor(orderId)).toBe(300);
    expect(await balanceOf(seller.id)).toBe(10_000);

    // The seller takes it out, which is the point of the wallet.
    await db.payoutAddress.create({
      data: { userId: seller.id, address: "TXyz1234567890", network: "TRON" },
    });
    const requested = await requestWithdrawal(seller.id, 10_000);
    if (!requested.ok) throw new Error(`withdrawal: ${requested.reason}`);

    // Held, so it cannot be spent twice while finance looks at it.
    let wallet = await getWallet(seller.id);
    expect(wallet.availableUsd).toBe(0);
    expect(wallet.balanceUsd).toBe(10_000);

    const sent = await settleWithdrawal(
      requested.withdrawalId,
      staff.id,
      "SENT",
      "0xpayout",
    );
    expect(sent.ok).toBe(true);

    wallet = await getWallet(seller.id);
    expect(wallet.balanceUsd).toBe(0);
    expect(wallet.availableUsd).toBe(0);
  }),
);

test(
  "a buyer tops up once and pays two deals from the balance",
  withCleanDb(async () => {
    const buyer = await seedUser();
    await creditDeposit(buyer.id, 1_000, "cryptomus-topup-1", "USDT");

    const first = await seedListing();
    const second = await seedListing();
    const a = await createDeal({
      listingId: first.listing.id,
      buyerId: buyer.id,
      mode: "SAFEST",
    });
    const b = await createDeal({
      listingId: second.listing.id,
      buyerId: buyer.id,
      mode: "SAFEST",
    });
    if (!a.ok || !b.ok) throw new Error("setup");

    expect(await payFromWallet(a.orderId, buyer.id)).toMatchObject({
      ok: true,
    });
    expect(await payFromWallet(b.orderId, buyer.id)).toMatchObject({
      ok: true,
    });

    // Two 3% fees on a $100 listing, out of a $10 top-up.
    expect((await getWallet(buyer.id)).balanceUsd).toBe(400);
    for (const id of [a.orderId, b.orderId]) {
      expect((await db.order.findUniqueOrThrow({ where: { id } })).status).toBe(
        "AWAITING_CUSTODY",
      );
    }
  }),
);

test(
  "the scheduled sweep is safe to run on a live database",
  withCleanDb(async () => {
    // Everything in flight, nothing stale: a sweep must change none of it.
    const { orderId } = await drive("SAFEST");
    const live = await seedListing();
    const open = await createDeal({
      listingId: live.listing.id,
      buyerId: live.buyer.id,
      mode: "FASTEST",
    });
    if (!open.ok) throw new Error("setup");

    const before = await db.order.findUniqueOrThrow({
      where: { id: open.orderId },
    });

    expect(await expireStaleDeals()).toBe(0);
    expect(await expireOffers()).toBe(0);
    expect(await purgeChat()).toEqual({ media: 0, messages: 0 });

    const after = await db.order.findUniqueOrThrow({
      where: { id: open.orderId },
    });
    expect(after.status).toBe(before.status);
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: orderId } })).status,
    ).toBe("COMPLETED");
  }),
);

test(
  "a deal above the approval threshold cannot be finished without a second pair of eyes",
  withCleanDb(async () => {
    // The guard that was a hard block until the UI could reach it.
    const seeded = await seedListing({ priceUsd: 600_000 });
    const staff = await seedUser("MODERATOR");
    const created = await createDeal({
      listingId: seeded.listing.id,
      buyerId: seeded.buyer.id,
      mode: "SAFEST",
    });
    if (!created.ok) throw new Error(created.reason);

    await assignAgent({
      orderId: created.orderId,
      agentId: seeded.agent.id,
      agentEmail: "a@b.test",
      agentBrand: "X",
      byUserId: staff.id,
    });
    await recordOpeningPayment(created.orderId, "pay-big", "USDT");

    const actors: Record<string, string> = {
      buyer: seeded.buyer.id,
      seller: seeded.seller.id,
      agent: seeded.agent.id,
    };
    for (const step of templateFor("SAFEST")) {
      if (step.position < 2 || step.position >= 8) continue;
      const r = await advanceStep({
        orderId: created.orderId,
        position: step.position,
        userId: actors[step.actor],
        ...(step.position === 6 ? { paymentRef: "0xabc" } : {}),
      });
      if (!r.ok) throw new Error(`step ${step.position}: ${r.reason}`);
    }

    expect(
      await advanceStep({
        orderId: created.orderId,
        position: 8,
        userId: actors.agent,
      }),
    ).toMatchObject({ ok: false, reason: "needs-approval" });

    expect(
      await advanceStep({
        orderId: created.orderId,
        position: 8,
        userId: actors.agent,
        approvedById: staff.id,
      }),
    ).toMatchObject({ ok: true });
  }),
);
