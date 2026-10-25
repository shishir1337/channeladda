import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { templateFor } from "@/lib/deal-templates";
import { balanceOf, createDeal, recordOpeningPayment } from "@/server/deals";
import { recordInvoice } from "@/server/invoices";
import {
  buyResellerPass,
  ratingFor,
  remindEndingPasses,
  reportRefundedDeposit,
  resellerStatus,
  settleBadgePayment,
} from "@/server/reseller";
import { creditDeposit, getWallet } from "@/server/wallet";
import { seedListing, seedUser, withCleanDb } from "@/test/db";
import { runStep } from "@/test/deal-steps";

// The owner's rules, 2026-10-20: a $500 deal earns 250 points for each
// side; the Reseller badge — $20 for 30 days, from the balance or by
// Cryptomus — triples them while it lasts and takes 30% off every fee.

const DAY = 86_400_000;

async function completedFastest(priceUsd: number) {
  const seeded = await seedListing({ priceUsd });
  const created = await createDeal({
    listingId: seeded.listing.id,
    buyerId: seeded.buyer.id,
    mode: "FASTEST",
    acceptedRevenueRisk: true,
  });
  if (!created.ok) throw new Error(created.reason);
  await db.order.update({
    where: { id: created.orderId },
    data: { agentId: seeded.agent.id },
  });
  await recordOpeningPayment(created.orderId, `pay-${created.orderId}`, "USDT");
  const actors: Record<string, string> = {
    buyer: seeded.buyer.id,
    seller: seeded.seller.id,
    agent: seeded.agent.id,
  };
  for (const step of templateFor("FASTEST").slice(1)) {
    const done = await runStep({
      orderId: created.orderId,
      position: step.position,
      userId: actors[step.actor],
    });
    if (!done.ok) throw new Error(`${step.position}: ${done.reason}`);
  }
  return seeded;
}

test(
  "both sides of a completed $500 deal earn 250 points",
  withCleanDb(async () => {
    const { buyer, seller } = await completedFastest(50_000);
    expect(await ratingFor(buyer.id)).toMatchObject({
      points: 250,
      reseller: false,
    });
    expect((await ratingFor(seller.id)).points).toBe(250);
  }),
);

test(
  "a pass bought from the balance costs the price once and turns the badge on",
  withCleanDb(async () => {
    const member = await seedUser();
    await creditDeposit(member.id, 2_000, "dep-1", "USDT");

    const bought = await buyResellerPass({
      userId: member.id,
      reference: "badge-1",
      via: "BALANCE",
    });
    expect(bought).toMatchObject({ ok: true });
    // The same press arriving twice buys one pass.
    expect(
      await buyResellerPass({
        userId: member.id,
        reference: "badge-1",
        via: "BALANCE",
      }),
    ).toMatchObject({ ok: true, already: true });

    expect(await balanceOf(member.id)).toBe(0);
    expect(await db.resellerPass.count({ where: { userId: member.id } })).toBe(
      1,
    );
    const status = await resellerStatus(member.id);
    expect(status.active).toBe(true);
    expect((status.endsAt?.getTime() ?? 0) - Date.now()).toBeGreaterThan(
      29.99 * DAY,
    );
    // Our side of it: the price is ours, booked as badge income.
    expect(
      await db.ledgerEntry.findFirstOrThrow({
        where: { userId: null, kind: "BADGE_FEE" },
      }),
    ).toMatchObject({ amountUsd: 2_000 });
  }),
);

test(
  "a balance short of the price buys nothing and writes nothing",
  withCleanDb(async () => {
    const member = await seedUser();
    await creditDeposit(member.id, 1_999, "dep-1", "USDT");
    expect(
      await buyResellerPass({
        userId: member.id,
        reference: "badge-1",
        via: "BALANCE",
      }),
    ).toEqual({ ok: false, reason: "insufficient" });
    expect(await balanceOf(member.id)).toBe(1_999);
    expect(await db.resellerPass.count()).toBe(0);
  }),
);

test(
  "a balance already promised to a withdrawal cannot buy a pass",
  withCleanDb(async () => {
    const member = await seedUser();
    await creditDeposit(member.id, 2_000, "dep-1", "USDT");
    await db.withdrawal.create({
      data: {
        userId: member.id,
        amountUsd: 1_000,
        address: "TXyz1234567890",
        network: "TRON",
        status: "REQUESTED",
      },
    });
    expect(
      await buyResellerPass({
        userId: member.id,
        reference: "badge-1",
        via: "BALANCE",
      }),
    ).toEqual({ ok: false, reason: "insufficient" });
  }),
);

test(
  "a member holding the badge cannot buy it again until it ends",
  withCleanDb(async () => {
    // The owner, 2026-10-26: paying again added more days, and they do not
    // want that. One pass at a time; the next once this one is over.
    const member = await seedUser();
    await creditDeposit(member.id, 4_000, "dep-1", "USDT");
    const first = await buyResellerPass({
      userId: member.id,
      reference: "badge-1",
      via: "BALANCE",
    });
    if (!first.ok) throw new Error("not bought");

    expect(
      await buyResellerPass({
        userId: member.id,
        reference: "badge-2",
        via: "BALANCE",
      }),
    ).toEqual({ ok: false, reason: "active", endsAt: first.endsAt });
    // Nothing was charged for the refusal.
    expect(await balanceOf(member.id)).toBe(2_000);
    expect(await db.resellerPass.count({ where: { userId: member.id } })).toBe(
      1,
    );

    // Once it has ended, it can be bought again, from that day.
    await db.resellerPass.updateMany({
      where: { userId: member.id },
      data: { endsAt: new Date(Date.now() - 1000) },
    });
    const again = await buyResellerPass({
      userId: member.id,
      reference: "badge-3",
      via: "BALANCE",
    });
    expect(again.ok).toBe(true);
    expect((await resellerStatus(member.id)).active).toBe(true);
  }),
);

test(
  "a crypto badge payment that lands while a badge is running goes to the balance",
  withCleanDb(async () => {
    const member = await seedUser();
    await creditDeposit(member.id, 2_000, "dep-1", "USDT");
    await buyResellerPass({
      userId: member.id,
      reference: "badge-1",
      via: "BALANCE",
    });
    await recordInvoice({
      reference: "BADGE-late",
      purpose: "BADGE",
      amountUsd: 2_000,
      userId: member.id,
    });

    expect(await settleBadgePayment("BADGE-late", 2_000, "USDT")).toBe(
      "credited-only",
    );
    expect(await db.resellerPass.count({ where: { userId: member.id } })).toBe(
      1,
    );
    expect(await balanceOf(member.id)).toBe(2_000);
    const told = await db.notification.findMany({
      where: { userId: member.id, kind: "BADGE" },
      select: { title: true },
    });
    expect(told.map((n) => n.title)).toContain(
      "Your payment is in your balance",
    );
  }),
);

test(
  "points triple while the badge lasts and fall back when it ends",
  withCleanDb(async () => {
    const { buyer } = await completedFastest(50_000);
    await creditDeposit(buyer.id, 2_000, "dep-1", "USDT");
    await buyResellerPass({
      userId: buyer.id,
      reference: "badge-1",
      via: "BALANCE",
    });
    expect(await ratingFor(buyer.id)).toMatchObject({
      points: 750,
      reseller: true,
    });

    await db.resellerPass.updateMany({
      where: { userId: buyer.id },
      data: { endsAt: new Date(Date.now() - 1000) },
    });
    expect(await ratingFor(buyer.id)).toMatchObject({
      points: 250,
      reseller: false,
    });
  }),
);

test(
  "a badge holder's deal is opened at 30% off their fee, and nobody else's",
  withCleanDb(async () => {
    const seeded = await seedListing({ settings: { sellerFeeBp: 500 } });
    await creditDeposit(seeded.buyer.id, 2_000, "dep-1", "USDT");
    await buyResellerPass({
      userId: seeded.buyer.id,
      reference: "badge-1",
      via: "BALANCE",
    });

    const safest = await createDeal({
      listingId: seeded.listing.id,
      buyerId: seeded.buyer.id,
      mode: "FASTEST",
      acceptedRevenueRisk: true,
    });
    if (!safest.ok) throw new Error(safest.reason);
    const order = await db.order.findUniqueOrThrow({
      where: { id: safest.orderId },
    });
    // 3% of $100 is $3; with the badge it is $2.10. The seller has no badge
    // and pays their 5% in full.
    expect(order.buyerFeeUsd).toBe(210);
    expect(order.totalUsd).toBe(10_210);
    expect(order.sellerFeeUsd).toBe(500);
  }),
);

test(
  "a seller with the badge pays 30% less seller fee",
  withCleanDb(async () => {
    const seeded = await seedListing({ settings: { sellerFeeBp: 500 } });
    await creditDeposit(seeded.seller.id, 2_000, "dep-1", "USDT");
    await buyResellerPass({
      userId: seeded.seller.id,
      reference: "badge-1",
      via: "BALANCE",
    });
    const created = await createDeal({
      listingId: seeded.listing.id,
      buyerId: seeded.buyer.id,
      mode: "FASTEST",
      acceptedRevenueRisk: true,
    });
    if (!created.ok) throw new Error(created.reason);
    const order = await db.order.findUniqueOrThrow({
      where: { id: created.orderId },
    });
    expect(order.buyerFeeUsd).toBe(300);
    expect(order.sellerFeeUsd).toBe(350);
  }),
);

test(
  "a badge paid by Cryptomus is credited and spent on the pass, once",
  withCleanDb(async () => {
    const member = await seedUser();
    await recordInvoice({
      reference: "BADGE-abc",
      purpose: "BADGE",
      amountUsd: 2_000,
      userId: member.id,
    });

    expect(await settleBadgePayment("BADGE-abc", 2_000, "USDT")).toBe("bought");
    // The callback and the sweep can both arrive.
    expect(await settleBadgePayment("BADGE-abc", 2_000, "USDT")).toBe(
      "already",
    );

    expect((await resellerStatus(member.id)).active).toBe(true);
    expect(await db.resellerPass.count()).toBe(1);
    expect(await balanceOf(member.id)).toBe(0);
    const wallet = await getWallet(member.id);
    expect(wallet.entries.map((e) => e.kind).sort()).toEqual([
      "BADGE_FEE",
      "DEPOSIT",
    ]);
  }),
);

test(
  "a crypto badge is charged what its invoice asked, and never takes other money",
  withCleanDb(async () => {
    // The price went up between checkout and the payment landing. The
    // member paid what they were asked; the difference must not come out
    // of money they had for something else.
    const member = await seedUser();
    await creditDeposit(member.id, 1_000, "sale-money", "USDT");
    await recordInvoice({
      reference: "BADGE-abc",
      purpose: "BADGE",
      amountUsd: 2_000,
      userId: member.id,
    });
    await db.platformSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", resellerPriceUsd: 2_500 },
      update: { resellerPriceUsd: 2_500 },
    });
    const { clearSettingsCache } = await import("@/server/settings");
    clearSettingsCache();

    expect(await settleBadgePayment("BADGE-abc", 2_000, "USDT")).toBe("bought");
    expect(await balanceOf(member.id)).toBe(1_000);
    expect((await resellerStatus(member.id)).active).toBe(true);
  }),
);

test(
  "a crypto payment short of its invoice stays in the balance, and buys nothing",
  withCleanDb(async () => {
    const member = await seedUser();
    await creditDeposit(member.id, 1_000, "sale-money", "USDT");
    await recordInvoice({
      reference: "BADGE-abc",
      purpose: "BADGE",
      amountUsd: 2_000,
      userId: member.id,
    });

    expect(await settleBadgePayment("BADGE-abc", 1_500, "USDT")).toBe(
      "credited-only",
    );
    expect(await balanceOf(member.id)).toBe(2_500);
    expect((await resellerStatus(member.id)).active).toBe(false);
    // And they hear where their money went.
    expect(await db.notification.count({ where: { userId: member.id } })).toBe(
      1,
    );
  }),
);

test(
  "two strangers buying at the same moment both get their badge",
  withCleanDb(async () => {
    // A lost serialisable race between two different members' purchases
    // was taken for a short balance, so a paid crypto badge went
    // undelivered and its invoice was closed.
    for (let round = 0; round < 4; round++) {
      const a = await seedUser();
      const b = await seedUser();
      await creditDeposit(b.id, 2_000, `dep-${round}`, "USDT");
      await recordInvoice({
        reference: `BADGE-race-${round}`,
        purpose: "BADGE",
        amountUsd: 2_000,
        userId: a.id,
      });
      const [settled, bought] = await Promise.all([
        settleBadgePayment(`BADGE-race-${round}`, 2_000, "USDT"),
        buyResellerPass({
          userId: b.id,
          reference: `bal-${round}`,
          via: "BALANCE",
        }),
      ]);
      expect(settled, `round ${round}`).toBe("bought");
      expect(bought, `round ${round}`).toMatchObject({ ok: true });
    }
  }),
);

test(
  "a badge or top-up the processor refunds is put in front of finance, once",
  withCleanDb(async () => {
    const member = await seedUser();
    const finance = await seedUser("FINANCE");
    await recordInvoice({
      reference: "BADGE-abc",
      purpose: "BADGE",
      amountUsd: 2_000,
      userId: member.id,
    });
    await settleBadgePayment("BADGE-abc", 2_000, "USDT");

    await reportRefundedDeposit("BADGE-abc", "refund_paid");
    await reportRefundedDeposit("BADGE-abc", "refund_paid");

    expect(await db.notification.count({ where: { userId: finance.id } })).toBe(
      1,
    );
    expect(
      await db.auditLog.count({
        where: { action: "payment.refunded_by_processor", entityId: member.id },
      }),
    ).toBe(1);
  }),
);

test(
  "a holder is reminded once, three days before their last pass ends",
  withCleanDb(async () => {
    const member = await seedUser();
    const now = new Date();
    await db.resellerPass.create({
      data: {
        userId: member.id,
        startsAt: new Date(now.getTime() - 28 * DAY),
        endsAt: new Date(now.getTime() + 2 * DAY),
        amountUsd: 2_000,
        reference: "badge-old",
        paidVia: "BALANCE",
      },
    });

    expect(await remindEndingPasses(now)).toBe(1);
    expect(await remindEndingPasses(now)).toBe(0);
    expect(await db.notification.count({ where: { userId: member.id } })).toBe(
      1,
    );
  }),
);

test(
  "nobody is reminded about a pass that is already extended",
  withCleanDb(async () => {
    const member = await seedUser();
    const now = new Date();
    for (const [reference, start, end] of [
      ["badge-1", -28, 2],
      ["badge-2", 2, 32],
    ] as const) {
      await db.resellerPass.create({
        data: {
          userId: member.id,
          startsAt: new Date(now.getTime() + start * DAY),
          endsAt: new Date(now.getTime() + end * DAY),
          amountUsd: 2_000,
          reference,
          paidVia: "BALANCE",
        },
      });
    }
    expect(await remindEndingPasses(now)).toBe(0);
  }),
);

test(
  "badge income is the month's revenue on the money desk, and the ledger agrees",
  withCleanDb(async () => {
    const { monthFigures, monthOf } = await import("@/server/admin-money");
    const member = await seedUser();
    await creditDeposit(member.id, 2_000, "dep-1", "USDT");
    await buyResellerPass({
      userId: member.id,
      reference: "badge-1",
      via: "BALANCE",
    });

    const figures = await monthFigures(monthOf(new Date()));
    expect(figures.fees.badges).toEqual({ cents: 2_000, count: 1 });
    expect(figures.fees.net).toBe(2_000);
    expect(figures.spentOnBadges).toEqual({ cents: 2_000, count: 1 });
    expect(figures.closing.memberBalances).toBe(0);
  }),
);
