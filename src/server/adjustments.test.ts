import { expect, test } from "vitest";
import { db } from "@/lib/db";
import {
  adjustBalance,
  FINANCE_CREDIT_CAP_USD,
  findMember,
  listRecentAdjustments,
  MAX_ADJUSTMENT_USD,
} from "@/server/adjustments";
import { moneyPosition, monthFigures, monthOf } from "@/server/admin-money";
import { balanceOf } from "@/server/deals";
import { creditDeposit, getWallet, requestWithdrawal } from "@/server/wallet";
import { seedUser, withCleanDb } from "@/test/db";

const REASON = "Missed refund of the admin fee on CA-48213";

/** A member with money in their wallet and a payout address on file. */
async function memberWith(cents: number) {
  const member = await seedUser();
  if (cents > 0)
    await creditDeposit(member.id, cents, `dep-${member.id}`, "USDT");
  await db.payoutAddress.create({
    data: {
      userId: member.id,
      address: "TXyz1234567890abcdefg",
      network: "TRON",
    },
  });
  return member;
}

test(
  "a credit adds to the member and takes the same amount from the platform",
  withCleanDb(async () => {
    const finance = await seedUser("FINANCE");
    const member = await memberWith(0);

    const result = await adjustBalance({
      userId: member.id,
      amountUsd: 2_000,
      reason: REASON,
      byUserId: finance.id,
    });
    expect(result).toMatchObject({
      ok: true,
      balanceUsd: 2_000,
      availableUsd: 2_000,
    });

    expect(await balanceOf(member.id)).toBe(2_000);

    // Two rows, one each side, summing to zero — the books still balance.
    const rows = await db.ledgerEntry.findMany({
      where: { kind: "ADJUSTMENT" },
    });
    expect(rows).toHaveLength(2);
    expect(rows.reduce((sum, r) => sum + r.amountUsd, 0)).toBe(0);
    const platform = rows.find((r) => r.userId === null);
    expect(platform?.amountUsd).toBe(-2_000);
    expect(platform?.note).toContain(member.email);

    // The member's row carries the reason, which their wallet shows them.
    const mine = rows.find((r) => r.userId === member.id);
    expect(mine?.note).toBe(REASON);

    // On the record, under the person who did it.
    const audit = await db.auditLog.findFirst({
      where: { action: "wallet.adjustment" },
    });
    expect(audit).toMatchObject({
      actorId: finance.id,
      entity: "user",
      entityId: member.id,
    });

    // And told, because it is their money.
    expect(
      await db.notification.count({
        where: { userId: member.id, kind: "PAYOUT" },
      }),
    ).toBe(1);

    // The desk sees it as a correction, and as money that came out of ours.
    const figures = await monthFigures(monthOf(new Date()));
    expect(figures.adjustments.credits).toEqual({ cents: 2_000, count: 1 });
    const position = await moneyPosition();
    expect(position.platformOwn).toBe(-2_000);
    expect(position.memberBalances.cents).toBe(2_000);
    // A correction moves money between pockets; it adds nothing on hand.
    expect(position.onHand).toBe(0);

    const recent = await listRecentAdjustments();
    expect(recent[0]).toMatchObject({
      amountUsd: 2_000,
      reason: REASON,
      byName: finance.name,
      member: { id: member.id },
    });
  }),
);

test(
  "a debit cannot take the balance below what is promised to a pending withdrawal",
  withCleanDb(async () => {
    const finance = await seedUser("FINANCE");
    const member = await memberWith(50_000);
    const asked = await requestWithdrawal(member.id, 30_000);
    expect(asked).toMatchObject({ ok: true });

    // 50_000 balance, 30_000 promised: 20_000 is all that can be taken.
    expect(
      await adjustBalance({
        userId: member.id,
        amountUsd: -25_000,
        reason: REASON,
        byUserId: finance.id,
      }),
    ).toEqual({ ok: false, reason: "insufficient" });
    expect(await balanceOf(member.id)).toBe(50_000);

    const taken = await adjustBalance({
      userId: member.id,
      amountUsd: -20_000,
      reason: "Credited twice by mistake on the same top-up",
      byUserId: finance.id,
    });
    expect(taken).toMatchObject({
      ok: true,
      balanceUsd: 30_000,
      availableUsd: 0,
    });

    const wallet = await getWallet(member.id);
    expect(wallet.balanceUsd).toBe(30_000);
    expect(wallet.pendingWithdrawalUsd).toBe(30_000);
    expect(wallet.availableUsd).toBe(0);

    // The platform got it back, so the pair still nets to zero.
    expect(
      (
        await db.ledgerEntry.aggregate({
          where: { kind: "ADJUSTMENT" },
          _sum: { amountUsd: true },
        })
      )._sum.amountUsd,
    ).toBe(0);
  }),
);

test(
  "a non-finance user is refused, whatever they ask for",
  withCleanDb(async () => {
    const member = await memberWith(10_000);
    for (const role of ["USER", "AGENT", "MODERATOR"] as const) {
      const someone = await seedUser(role);
      expect(
        await adjustBalance({
          userId: member.id,
          amountUsd: 1_000,
          reason: REASON,
          byUserId: someone.id,
        }),
      ).toEqual({ ok: false, reason: "wrong-actor" });
    }

    const suspended = await seedUser("FINANCE");
    await db.user.update({
      where: { id: suspended.id },
      data: { bannedAt: new Date() },
    });
    expect(
      await adjustBalance({
        userId: member.id,
        amountUsd: 1_000,
        reason: REASON,
        byUserId: suspended.id,
      }),
    ).toEqual({ ok: false, reason: "wrong-actor" });

    expect(await db.ledgerEntry.count({ where: { kind: "ADJUSTMENT" } })).toBe(
      0,
    );
    expect(await balanceOf(member.id)).toBe(10_000);
  }),
);

test(
  "a reason is required, and so is a whole, sane amount",
  withCleanDb(async () => {
    const finance = await seedUser("FINANCE");
    const member = await memberWith(0);
    const base = { userId: member.id, byUserId: finance.id };

    expect(
      await adjustBalance({ ...base, amountUsd: 1_000, reason: "  owed    " }),
    ).toEqual({ ok: false, reason: "reason-too-short" });
    expect(
      await adjustBalance({ ...base, amountUsd: 0, reason: REASON }),
    ).toEqual({ ok: false, reason: "bad-amount" });
    expect(
      await adjustBalance({ ...base, amountUsd: 10.5, reason: REASON }),
    ).toEqual({ ok: false, reason: "bad-amount" });
    expect(
      await adjustBalance({
        ...base,
        amountUsd: MAX_ADJUSTMENT_USD + 1,
        reason: REASON,
      }),
    ).toEqual({ ok: false, reason: "too-large" });

    expect(await db.ledgerEntry.count({ where: { kind: "ADJUSTMENT" } })).toBe(
      0,
    );
  }),
);

test(
  "finance can add up to the cap per member per day; past it needs a superadmin",
  withCleanDb(async () => {
    const finance = await seedUser("FINANCE");
    const superadmin = await seedUser("SUPERADMIN");
    const member = await memberWith(0);
    const credit = (amountUsd: number, byUserId = finance.id) =>
      adjustBalance({ userId: member.id, amountUsd, reason: REASON, byUserId });

    // A single credit over the cap.
    expect(await credit(FINANCE_CREDIT_CAP_USD + 1)).toEqual({
      ok: false,
      reason: "needs-superadmin",
    });

    // Split into two: the cap counts both.
    expect(await credit(40_000)).toMatchObject({ ok: true });
    expect(await credit(20_000)).toEqual({
      ok: false,
      reason: "needs-superadmin",
    });
    // Exactly up to the cap is fine.
    expect(await credit(10_000)).toMatchObject({ ok: true });
    expect(await credit(1)).toEqual({ ok: false, reason: "needs-superadmin" });

    // A superadmin is not capped.
    expect(await credit(100_000, superadmin.id)).toMatchObject({ ok: true });

    // A day later the window has moved on.
    await db.ledgerEntry.updateMany({
      where: { kind: "ADJUSTMENT" },
      data: { createdAt: new Date(Date.now() - 25 * 3_600_000) },
    });
    expect(await credit(40_000)).toMatchObject({ ok: true });

    expect(await balanceOf(member.id)).toBe(190_000);
  }),
);

test(
  "nobody corrects their own balance, and staff balances need a superadmin",
  withCleanDb(async () => {
    const finance = await seedUser("FINANCE");
    const colleague = await seedUser("FINANCE");
    const superadmin = await seedUser("SUPERADMIN");

    expect(
      await adjustBalance({
        userId: finance.id,
        amountUsd: 1_000,
        reason: REASON,
        byUserId: finance.id,
      }),
    ).toEqual({ ok: false, reason: "self" });

    expect(
      await adjustBalance({
        userId: colleague.id,
        amountUsd: 1_000,
        reason: REASON,
        byUserId: finance.id,
      }),
    ).toEqual({ ok: false, reason: "staff-account" });

    expect(
      await adjustBalance({
        userId: colleague.id,
        amountUsd: 1_000,
        reason: REASON,
        byUserId: superadmin.id,
      }),
    ).toMatchObject({ ok: true });

    expect(
      await adjustBalance({
        userId: superadmin.id,
        amountUsd: 1_000,
        reason: REASON,
        byUserId: superadmin.id,
      }),
    ).toEqual({ ok: false, reason: "self" });
  }),
);

test(
  "the same correction sent twice is recorded once",
  withCleanDb(async () => {
    const finance = await seedUser("FINANCE");
    const member = await memberWith(0);
    const input = {
      userId: member.id,
      amountUsd: 2_000,
      reason: REASON,
      byUserId: finance.id,
      key: "0123456789abcdef0123456789abcdef",
    };

    expect(await adjustBalance(input)).toMatchObject({ ok: true });
    expect(await adjustBalance(input)).toEqual({
      ok: false,
      reason: "duplicate",
    });
    expect(await balanceOf(member.id)).toBe(2_000);
    expect(await db.ledgerEntry.count({ where: { kind: "ADJUSTMENT" } })).toBe(
      2,
    );
  }),
);

test(
  "two credits racing cannot both slip under the cap",
  withCleanDb(async () => {
    const finance = await seedUser("FINANCE");
    const other = await seedUser("FINANCE");
    const member = await memberWith(0);

    // Each is under the cap alone; together they are over it.
    const results = await Promise.all([
      adjustBalance({
        userId: member.id,
        amountUsd: 30_000,
        reason: REASON,
        byUserId: finance.id,
      }),
      adjustBalance({
        userId: member.id,
        amountUsd: 30_000,
        reason: REASON,
        byUserId: other.id,
      }),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await balanceOf(member.id)).toBe(30_000);
  }),
);

test(
  "a member is found by exact email or id, and nothing else",
  withCleanDb(async () => {
    const member = await memberWith(5_000);

    expect((await findMember(member.email.toUpperCase()))?.id).toBe(member.id);
    expect((await findMember(member.id))?.wallet.balanceUsd).toBe(5_000);
    expect(await findMember(member.email.slice(0, 6))).toBeNull();
    expect(await findMember("")).toBeNull();
  }),
);
