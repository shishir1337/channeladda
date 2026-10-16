import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { createDeal } from "@/server/deals";
import {
  creditDeposit,
  getWallet,
  payFromWallet,
  requestWithdrawal,
  settleWithdrawal,
} from "@/server/wallet";
import { seedListing, seedUser, withCleanDb } from "@/test/db";

async function fund(userId: string, cents: number, ref = "dep-1") {
  await creditDeposit(userId, cents, ref, "USDT");
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
