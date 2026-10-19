import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { templateFor } from "@/lib/deal-templates";
import { createDeal, recordOpeningPayment } from "@/server/deals";
import {
  creditDeposit,
  getWallet,
  payFromWallet,
  requestWithdrawal,
  settleWithdrawal,
} from "@/server/wallet";
import { seedListing, seedUser, withCleanDb } from "@/test/db";
import { runStep } from "@/test/deal-steps";

async function fund(userId: string, cents: number, ref = "dep-1") {
  await creditDeposit(userId, cents, ref, "USDT");
}

/** A Safest deal paid and walked up to, not including, `stopBefore`. */
async function safestAt(stopBefore: number) {
  const seeded = await seedListing();
  const created = await createDeal({
    listingId: seeded.listing.id,
    buyerId: seeded.buyer.id,
    mode: "SAFEST",
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
  for (const step of templateFor("SAFEST")) {
    if (step.position < 2 || step.position >= stopBefore) continue;
    const r = await runStep({
      orderId: created.orderId,
      position: step.position,
      userId: actors[step.actor],
    });
    if (!r.ok) throw new Error(`step ${step.position}: ${r.reason}`);
  }
  return { ...seeded, orderId: created.orderId };
}

test(
  "a wallet starts empty",
  withCleanDb(async () => {
    const user = await seedUser();
    const wallet = await getWallet(user.id);
    expect(wallet.balanceUsd).toBe(0);
    expect(wallet.availableUsd).toBe(0);
    expect(wallet.entries).toEqual([]);
  }),
);

test(
  "a deposit credits the balance once",
  withCleanDb(async () => {
    const user = await seedUser();
    await fund(user.id, 50_000);
    expect((await getWallet(user.id)).balanceUsd).toBe(50_000);
  }),
);

test(
  "the same deposit reference is never credited twice",
  withCleanDb(async () => {
    // Cryptomus retries its callbacks, so this is the ordinary case, not an
    // attack: crediting twice would mint money.
    const user = await seedUser();
    await fund(user.id, 50_000, "dep-same");
    await fund(user.id, 50_000, "dep-same");
    expect((await getWallet(user.id)).balanceUsd).toBe(50_000);
  }),
);

test(
  "two concurrent deliveries of one deposit credit it once",
  withCleanDb(async () => {
    const user = await seedUser();
    await Promise.allSettled([
      fund(user.id, 25_000, "dep-race"),
      fund(user.id, 25_000, "dep-race"),
    ]);
    expect((await getWallet(user.id)).balanceUsd).toBe(25_000);
  }),
);

test(
  "a deposit of nothing or less is refused",
  withCleanDb(async () => {
    const user = await seedUser();
    await expect(fund(user.id, 0, "zero")).rejects.toThrow();
    await expect(fund(user.id, -500, "negative")).rejects.toThrow();
  }),
);

test(
  "paying a deal from the wallet debits exactly what was owed",
  withCleanDb(async () => {
    const seeded = await seedListing();
    const created = await createDeal({
      listingId: seeded.listing.id,
      buyerId: seeded.buyer.id,
      mode: "SAFEST",
    });
    if (!created.ok) throw new Error(created.reason);

    await fund(seeded.buyer.id, 10_000);
    expect(await payFromWallet(created.orderId, seeded.buyer.id)).toMatchObject(
      { ok: true },
    );

    // Safest owes the 3% fee alone.
    expect((await getWallet(seeded.buyer.id)).balanceUsd).toBe(9_700);
    const order = await db.order.findUniqueOrThrow({
      where: { id: created.orderId },
    });
    expect(order.status).toBe("AWAITING_CUSTODY");
    expect(order.paymentRef).toMatch(/^wallet:/);
  }),
);

test(
  "paying a safest fee from the balance holds it",
  withCleanDb(async () => {
    const seeded = await seedListing();
    const created = await createDeal({
      listingId: seeded.listing.id,
      buyerId: seeded.buyer.id,
      mode: "SAFEST",
    });
    if (!created.ok) throw new Error(created.reason);

    await fund(seeded.buyer.id, 10_000);
    await payFromWallet(created.orderId, seeded.buyer.id);

    const rows = await db.ledgerEntry.findMany({
      where: { orderId: created.orderId },
      orderBy: { amountUsd: "asc" },
    });
    expect(rows).toMatchObject([
      { kind: "ESCROW_HOLD", userId: seeded.buyer.id, amountUsd: -300 },
      { kind: "ESCROW_HOLD", userId: null, amountUsd: 300 },
    ]);
  }),
);

test(
  "the price of a safest deal is never paid from the balance",
  withCleanDb(async () => {
    // Our agent holds the channel and the buyer is to pay the seller
    // directly: there is nothing here for Channel Adda to take.
    const { orderId, buyer } = await safestAt(6);
    await fund(buyer.id, 12_000);
    expect(await payFromWallet(orderId, buyer.id)).toMatchObject({
      ok: false,
      reason: "not-payable",
    });
    expect((await getWallet(buyer.id)).availableUsd).toBe(12_000);
  }),
);

test(
  "a wallet payment is refused when the balance is short",
  withCleanDb(async () => {
    const seeded = await seedListing();
    const created = await createDeal({
      listingId: seeded.listing.id,
      buyerId: seeded.buyer.id,
      mode: "FASTEST",
    });
    if (!created.ok) throw new Error(created.reason);

    await fund(seeded.buyer.id, 1_000); // owes 10_300
    expect(await payFromWallet(created.orderId, seeded.buyer.id)).toMatchObject(
      { ok: false, reason: "insufficient" },
    );

    expect((await getWallet(seeded.buyer.id)).balanceUsd).toBe(1_000);
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: created.orderId } }))
        .status,
    ).toBe("AWAITING_PAYMENT");
  }),
);

test(
  "two concurrent wallet payments cannot both spend one balance",
  withCleanDb(async () => {
    const seeded = await seedListing();
    const other = await seedListing();
    const a = await createDeal({
      listingId: seeded.listing.id,
      buyerId: seeded.buyer.id,
      mode: "SAFEST",
    });
    const b = await createDeal({
      listingId: other.listing.id,
      buyerId: seeded.buyer.id,
      mode: "SAFEST",
    });
    if (!a.ok || !b.ok) throw new Error("setup");

    // Enough for one fee, not two.
    await fund(seeded.buyer.id, 300);
    const results = await Promise.all([
      payFromWallet(a.orderId, seeded.buyer.id),
      payFromWallet(b.orderId, seeded.buyer.id),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await getWallet(seeded.buyer.id)).balanceUsd).toBe(0);
  }),
);

test(
  "only the buyer can spend their own wallet on a deal",
  withCleanDb(async () => {
    const seeded = await seedListing();
    const created = await createDeal({
      listingId: seeded.listing.id,
      buyerId: seeded.buyer.id,
      mode: "SAFEST",
    });
    if (!created.ok) throw new Error(created.reason);
    await fund(seeded.seller.id, 10_000);

    expect(
      await payFromWallet(created.orderId, seeded.seller.id),
    ).toMatchObject({ ok: false, reason: "wrong-actor" });
  }),
);

// ------------------------------------------------------------- withdrawals

async function withPayout(cents: number) {
  const user = await seedUser();
  await db.payoutAddress.create({
    data: { userId: user.id, address: "TXyz1234567890", network: "TRON" },
  });
  await fund(user.id, cents);
  return user;
}

test(
  "a withdrawal holds the amount against the balance immediately",
  withCleanDb(async () => {
    const user = await withPayout(50_000);
    const result = await requestWithdrawal(user.id, 20_000);
    expect(result).toMatchObject({ ok: true });

    const wallet = await getWallet(user.id);
    // The money is still theirs until it is sent, but it must not be
    // spendable twice while finance is looking at it.
    expect(wallet.balanceUsd).toBe(50_000);
    expect(wallet.pendingWithdrawalUsd).toBe(20_000);
    expect(wallet.availableUsd).toBe(30_000);
  }),
);

test(
  "a second withdrawal cannot exceed what is left available",
  withCleanDb(async () => {
    const user = await withPayout(50_000);
    await requestWithdrawal(user.id, 40_000);
    expect(await requestWithdrawal(user.id, 20_000)).toMatchObject({
      ok: false,
      reason: "insufficient",
    });
  }),
);

test(
  "two concurrent withdrawals cannot both take the same balance",
  withCleanDb(async () => {
    const user = await withPayout(10_000);
    const results = await Promise.all([
      requestWithdrawal(user.id, 10_000),
      requestWithdrawal(user.id, 10_000),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await getWallet(user.id)).pendingWithdrawalUsd).toBe(10_000);
  }),
);

test(
  "a withdrawal needs a payout address on file",
  withCleanDb(async () => {
    const user = await seedUser();
    await fund(user.id, 50_000);
    expect(await requestWithdrawal(user.id, 10_000)).toMatchObject({
      ok: false,
      reason: "no-address",
    });
  }),
);

test(
  "sending a withdrawal debits the balance",
  withCleanDb(async () => {
    const user = await withPayout(50_000);
    const staff = await seedUser("FINANCE");
    const requested = await requestWithdrawal(user.id, 20_000);
    if (!requested.ok) throw new Error("setup");

    expect(
      await settleWithdrawal(requested.withdrawalId, staff.id, "SENT", "0xabc"),
    ).toMatchObject({ ok: true });

    const wallet = await getWallet(user.id);
    expect(wallet.balanceUsd).toBe(30_000);
    expect(wallet.pendingWithdrawalUsd).toBe(0);
    expect(wallet.availableUsd).toBe(30_000);
  }),
);

test(
  "rejecting a withdrawal returns it to the available balance",
  withCleanDb(async () => {
    const user = await withPayout(50_000);
    const staff = await seedUser("FINANCE");
    const requested = await requestWithdrawal(user.id, 20_000);
    if (!requested.ok) throw new Error("setup");

    await settleWithdrawal(requested.withdrawalId, staff.id, "REJECTED", null);

    const wallet = await getWallet(user.id);
    expect(wallet.balanceUsd).toBe(50_000);
    expect(wallet.pendingWithdrawalUsd).toBe(0);
    expect(wallet.availableUsd).toBe(50_000);
  }),
);

test(
  "a withdrawal cannot be settled twice",
  withCleanDb(async () => {
    const user = await withPayout(50_000);
    const staff = await seedUser("FINANCE");
    const requested = await requestWithdrawal(user.id, 20_000);
    if (!requested.ok) throw new Error("setup");

    await settleWithdrawal(requested.withdrawalId, staff.id, "SENT", "0xabc");
    expect(
      await settleWithdrawal(requested.withdrawalId, staff.id, "SENT", "0xdef"),
    ).toMatchObject({ ok: false, reason: "already-settled" });

    expect((await getWallet(user.id)).balanceUsd).toBe(30_000);
  }),
);

test(
  "only finance settles a withdrawal",
  withCleanDb(async () => {
    const user = await withPayout(50_000);
    const moderator = await seedUser("MODERATOR");
    const requested = await requestWithdrawal(user.id, 20_000);
    if (!requested.ok) throw new Error("setup");

    expect(
      await settleWithdrawal(
        requested.withdrawalId,
        moderator.id,
        "SENT",
        "0xabc",
      ),
    ).toMatchObject({ ok: false, reason: "wrong-actor" });
  }),
);

test(
  "a seller paid by a completed fastest deal can withdraw it",
  withCleanDb(async () => {
    // The whole reason the wallet exists: Fastest proceeds land here.
    const user = await seedUser();
    await db.payoutAddress.create({
      data: { userId: user.id, address: "TXyz", network: "TRON" },
    });
    await db.ledgerEntry.create({
      data: { userId: user.id, kind: "ESCROW_RELEASE", amountUsd: 10_000 },
    });

    expect(await requestWithdrawal(user.id, 10_000)).toMatchObject({
      ok: true,
    });
  }),
);

test(
  "a withdrawal below the platform minimum is refused",
  withCleanDb(async () => {
    // Network fees on a crypto payout are a floor the seller pays regardless
    // of size, so a two-dollar withdrawal costs more to send than it carries.
    // The minimum is a setting rather than a constant because the fee depends
    // on the chain, and only the admin can see what it is costing.
    const user = await withPayout(50_000);

    expect(await requestWithdrawal(user.id, 500)).toMatchObject({
      ok: false,
      reason: "below-minimum",
    });
    expect(await requestWithdrawal(user.id, 2_000)).toMatchObject({ ok: true });

    const wallet = await getWallet(user.id);
    expect(wallet.pendingWithdrawalUsd).toBe(2_000);
  }),
);

test(
  "the admin can lower the withdrawal minimum",
  withCleanDb(async () => {
    const admin = await seedUser("SUPERADMIN");
    const { updateSettings } = await import("@/server/settings");
    const user = await withPayout(50_000);

    const saved = await updateSettings(
      {
        buyerFeeBpSafest: 300,
        buyerFeeBpFastest: 300,
        sellerFeeBp: 0,
        maxHoldsPerAgent: 10,
        secondApprovalAbove: 5_000,
        offerExpiryHours: 48,
        minWithdrawal: 3,
        paymentWindowHours: 48,
        resellerPrice: 20,
        resellerDiscountBp: 3000,
        resellerPointsMultiplier: 3,
      },
      admin.id,
    );
    expect(saved).toMatchObject({ ok: true });

    expect(await requestWithdrawal(user.id, 500)).toMatchObject({ ok: true });
  }),
);

// ------------------------------------------- the payout address cooling-off

test(
  "a new payout address locks withdrawals for a day",
  withCleanDb(async () => {
    // The help centre promises this in so many words — "adding or changing a
    // payout address locks withdrawals for 24 hours… address-change attacks
    // are the most common way marketplace sellers lose money, and this delay
    // is what stops them" — and nothing enforced it. The column was there,
    // with a comment saying what it was for, and no code ever read or wrote
    // it. A stolen session emptied the balance in one request.
    const { setPayoutAddress } = await import("@/server/wallet");
    const user = await seedUser();
    await fund(user.id, 50_000);

    await setPayoutAddress(user.id, "TXyz1234567890abcdef", "TRON");

    expect(await requestWithdrawal(user.id, 20_000)).toMatchObject({
      ok: false,
      reason: "address-locked",
    });
  }),
);

test(
  "the lock lifts, and re-saving the same address does not restart it",
  withCleanDb(async () => {
    const { setPayoutAddress } = await import("@/server/wallet");
    const user = await seedUser();
    await fund(user.id, 50_000);
    await setPayoutAddress(user.id, "TXyz1234567890abcdef", "TRON");

    // A day passes.
    await db.payoutAddress.update({
      where: { userId: user.id },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });
    expect(await requestWithdrawal(user.id, 20_000)).toMatchObject({
      ok: true,
    });

    // Saving the same address again is not a change, so it must not lock a
    // seller out of their own money for another day.
    await setPayoutAddress(user.id, "TXyz1234567890abcdef", "TRON");
    expect(await requestWithdrawal(user.id, 10_000)).toMatchObject({
      ok: true,
    });
  }),
);

test(
  "changing the address locks withdrawals again",
  withCleanDb(async () => {
    const { setPayoutAddress } = await import("@/server/wallet");
    const user = await seedUser();
    await fund(user.id, 50_000);
    await setPayoutAddress(user.id, "TXyz1234567890abcdef", "TRON");
    await db.payoutAddress.update({
      where: { userId: user.id },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });

    await setPayoutAddress(user.id, "TAbc0987654321fedcba", "TRON");

    expect(await requestWithdrawal(user.id, 20_000)).toMatchObject({
      ok: false,
      reason: "address-locked",
    });
  }),
);

// --------------------------------------------- what we hold for a seller

test(
  "a safest sale is never held for the seller, even once the buyer says they paid",
  withCleanDb(async () => {
    // The buyer's Paid means they paid the seller directly. None of it is
    // with us, so the seller's wallet must not promise it.
    const { seller } = await safestAt(7);
    const wallet = await getWallet(seller.id);
    expect(wallet.heldForSales).toEqual([]);
    expect(wallet.heldForSalesUsd).toBe(0);
  }),
);

/** A Fastest deal paid and walked up to, not including, `stopBefore`. */
async function fastestAt(stopBefore: number) {
  const seeded = await seedListing();
  const created = await createDeal({
    listingId: seeded.listing.id,
    buyerId: seeded.buyer.id,
    mode: "FASTEST",
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
  for (const step of templateFor("FASTEST")) {
    if (step.position < 2 || step.position >= stopBefore) continue;
    const r = await runStep({
      orderId: created.orderId,
      position: step.position,
      userId: actors[step.actor],
    });
    if (!r.ok) throw new Error(`step ${step.position}: ${r.reason}`);
  }
  return { ...seeded, orderId: created.orderId };
}

test(
  "a held sale moves to the balance on completion",
  withCleanDb(async () => {
    const { seller } = await fastestAt(7);
    const wallet = await getWallet(seller.id);
    expect(wallet.heldForSales).toEqual([]);
    expect(wallet.heldForSalesUsd).toBe(0);
    expect(wallet.availableUsd).toBe(10_000);
  }),
);

test(
  "a held sale cannot be withdrawn",
  withCleanDb(async () => {
    const { seller } = await fastestAt(4);
    expect((await getWallet(seller.id)).heldForSalesUsd).toBe(10_000);
    await db.payoutAddress.create({
      data: { userId: seller.id, address: "TXyz1234567890", network: "TRON" },
    });

    expect(await requestWithdrawal(seller.id, 10_000)).toMatchObject({
      ok: false,
      reason: "insufficient",
    });
  }),
);

test(
  "a fastest sale is held the same way",
  withCleanDb(async () => {
    const seeded = await seedListing();
    const created = await createDeal({
      listingId: seeded.listing.id,
      buyerId: seeded.buyer.id,
      mode: "FASTEST",
    });
    if (!created.ok) throw new Error(created.reason);
    await recordOpeningPayment(created.orderId, created.reference, "USDT");

    const wallet = await getWallet(seeded.seller.id);
    expect(wallet.heldForSalesUsd).toBe(10_000);
    expect(wallet.heldForSales[0]).toMatchObject({ mode: "FASTEST" });
  }),
);

test(
  "a safest sale in custody is not shown as held",
  withCleanDb(async () => {
    // Only the fee is with us, and the price never will be.
    const { seller } = await safestAt(6);
    const wallet = await getWallet(seller.id);
    expect(wallet.heldForSales).toEqual([]);
  }),
);
