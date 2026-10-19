import { describe, expect, test } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { templateFor } from "@/lib/deal-templates";
import {
  centsToDecimal,
  csvCell,
  describeInvoice,
  exportLedger,
  exportPayouts,
  holdMismatches,
  latestInvoicesFor,
  listFinishedDeals,
  listInvoicesNeedingAttention,
  moneyPosition,
  monthFigures,
  monthOf,
  parseMonth,
  recentMonths,
  referenceFrom,
  searchDeals,
  shiftMonth,
} from "@/server/admin-money";
import {
  assignAgent,
  createDeal,
  recordOpeningPayment,
  recordStrayPricePayment,
  resolveDeal,
} from "@/server/deals";
import {
  creditDeposit,
  requestWithdrawal,
  settleWithdrawal,
} from "@/server/wallet";
import { seedListing, seedUser, withCleanDb } from "@/test/db";
import { runStep } from "@/test/deal-steps";

/**
 * The money desk reads the ledger and nothing else, so these tests drive
 * real deals through the real deal code and then hold the desk's figures
 * up against the ledger rows those deals wrote.
 *
 * Every deal here is $100 at the default 3% buyer fee, with a 5% seller fee
 * where a test sets one — so a Fastest buyer pays 10_300 cents, we keep 300
 * plus 500, and the seller is credited 9_500.
 */

const SELLER_FEE = { sellerFeeBp: 500 };

type Mode = "SAFEST" | "FASTEST";

/** A deal opened, paid, and walked through every step to COMPLETED. */
async function completedDeal(mode: Mode) {
  const seeded = await seedListing({ settings: SELLER_FEE });
  const finance = await seedUser("FINANCE");
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
    byUserId: finance.id,
  });
  if (!assigned.ok) throw new Error(`assignAgent: ${assigned.reason}`);

  await recordOpeningPayment(orderId, created.reference, "USDT");

  const actors: Record<string, string> = {
    buyer: seeded.buyer.id,
    seller: seeded.seller.id,
    agent: seeded.agent.id,
  };
  for (const step of templateFor(mode)) {
    if (step.position < 2) continue;
    const result = await runStep({
      orderId,
      position: step.position,
      userId: actors[step.actor],
    });
    if (!result.ok) {
      throw new Error(`step ${step.position}: ${result.reason}`);
    }
  }
  return { ...seeded, orderId, reference: created.reference, finance };
}

/** A deal opened and paid, and nothing else yet. */
async function paidDeal(mode: Mode) {
  const seeded = await seedListing({ settings: SELLER_FEE });
  const finance = await seedUser("FINANCE");
  const created = await createDeal({
    listingId: seeded.listing.id,
    buyerId: seeded.buyer.id,
    mode,
  });
  if (!created.ok) throw new Error(`createDeal: ${created.reason}`);
  await recordOpeningPayment(created.orderId, created.reference, "USDT");
  return {
    ...seeded,
    orderId: created.orderId,
    reference: created.reference,
    finance,
  };
}

/** A paid Fastest deal that finance refunded in full. */
async function refundedDeal() {
  const deal = await paidDeal("FASTEST");
  const resolved = await resolveDeal({
    orderId: deal.orderId,
    to: "REFUNDED",
    byUserId: deal.finance.id,
    note: "Seller never transferred the channel",
  });
  if (!resolved.ok) throw new Error(`resolveDeal: ${resolved.reason}`);
  return deal;
}

/** What the ledger itself says, summed directly, for the desk to agree with. */
async function ledgerSum(where: Prisma.LedgerEntryWhereInput) {
  const { _sum } = await db.ledgerEntry.aggregate({
    where,
    _sum: { amountUsd: true },
  });
  return _sum.amountUsd ?? 0;
}

// ------------------------------------------------------------------ months

describe("months", () => {
  const now = new Date("2026-10-17T12:00:00Z");

  test("a month is midnight to midnight UTC", () => {
    const month = parseMonth("2026-02", now);
    expect(month.key).toBe("2026-02");
    expect(month.start.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(month.end.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(month.label).toBe("February 2026");
  });

  test("anything that is not a sane YYYY-MM is the current month", () => {
    for (const junk of [
      undefined,
      "",
      "2026-13",
      "26-10",
      "1999-01",
      "2026-10-01",
      42,
    ]) {
      expect(parseMonth(junk, now).key).toBe("2026-10");
    }
  });

  test("months step across a year boundary", () => {
    const jan = parseMonth("2026-01", now);
    expect(shiftMonth(jan, -1).key).toBe("2025-12");
    expect(shiftMonth(shiftMonth(jan, -1), 1).key).toBe("2026-01");
    expect(recentMonths(3, now).map((m) => m.key)).toEqual([
      "2026-10",
      "2026-09",
      "2026-08",
    ]);
  });
});

// ----------------------------------------------------------------- figures

describe("month figures", () => {
  test(
    "a completed Fastest, a completed Safest and a refunded deal add up to what the ledger says",
    withCleanDb(async () => {
      await completedDeal("FASTEST");
      await completedDeal("SAFEST");
      const refunded = await refundedDeal();

      const month = monthOf(new Date());
      const figures = await monthFigures(month);

      // Fees: the buyer fee on each completed deal, and the seller fee on
      // the Fastest one — a Safest price goes to the seller directly, so
      // there is nothing to take a seller fee from. The refunded deal
      // earned nothing — its fee was never booked.
      expect(figures.fees.safest.buyer).toEqual({ cents: 300, count: 1 });
      expect(figures.fees.safest.seller).toEqual({ cents: 0, count: 0 });
      expect(figures.fees.fastest.buyer).toEqual({ cents: 300, count: 1 });
      expect(figures.fees.fastest.seller).toEqual({ cents: 500, count: 1 });
      expect(figures.fees.net).toBe(1_100);

      // And the ledger agrees: the platform's own rows for the month sum to
      // exactly the fees, because every hold has netted to zero.
      expect(await ledgerSum({ userId: null })).toBe(figures.fees.net);
      expect(
        await ledgerSum({
          userId: null,
          kind: { in: ["BUYER_FEE", "SELLER_FEE"] },
        }),
      ).toBe(1_100);

      // Two Fastest buyers paid price + fee in, and the Safest buyer the fee
      // alone; the Fastest seller was credited the price less the 5% seller
      // fee; one buyer got the whole hold back.
      expect(figures.deals.paidIn).toEqual({ cents: 20_900, count: 3 });
      expect(figures.deals.toSellers).toEqual({ cents: 9_500, count: 1 });
      expect(figures.refunds.fastest).toEqual({ cents: 10_300, count: 1 });
      expect(figures.refunds.safest.cents).toBe(0);
      expect(figures.refunds.total).toBe(10_300);
      expect(
        await ledgerSum({ userId: refunded.buyer.id, kind: "REFUND" }),
      ).toBe(figures.refunds.fastest.cents);

      // Nothing else moved.
      expect(figures.deposits.topUps.cents).toBe(0);
      expect(figures.payouts.cents).toBe(0);
      expect(figures.adjustments.credits.cents).toBe(0);

      // At the close (now, for this month), nothing is held for buyers and
      // members hold the Fastest seller's 9_500 and the refunded buyer's
      // 10_300.
      expect(figures.closing.heldForBuyers).toBe(0);
      expect(figures.closing.memberBalances).toBe(19_800);
    }),
  );

  test(
    "a refunded safest fee is not counted as revenue",
    withCleanDb(async () => {
      const deal = await paidDeal("SAFEST");
      const cancelled = await resolveDeal({
        orderId: deal.orderId,
        to: "CANCELLED",
        byUserId: deal.finance.id,
        note: "Seller withdrew before custody",
      });
      expect(cancelled).toMatchObject({ ok: true });

      // It was held, never earned, so giving it back takes nothing off the
      // month: the refund is held money going home.
      const figures = await monthFigures(monthOf(new Date()));
      expect(figures.fees.safest.buyer.cents).toBe(0);
      expect(figures.fees.net).toBe(0);
      expect(figures.refunds.safest.cents).toBe(300);
      expect(await ledgerSum({ userId: null })).toBe(0);
    }),
  );

  test(
    "rows written in another month are not counted in this one",
    withCleanDb(async () => {
      await completedDeal("FASTEST");
      const thisMonth = monthOf(new Date());
      const lastMonth = shiftMonth(thisMonth, -1);

      // Move everything to the middle of last month.
      const middle = new Date(
        (lastMonth.start.getTime() + lastMonth.end.getTime()) / 2,
      );
      await db.ledgerEntry.updateMany({ data: { createdAt: middle } });

      const now = await monthFigures(thisMonth);
      expect(now.fees.net).toBe(0);
      expect(now.deals.paidIn.count).toBe(0);

      const then = await monthFigures(lastMonth);
      expect(then.fees.net).toBe(800);
      expect(then.deals.paidIn.cents).toBe(10_300);
      // Closing position of last month is taken at its end.
      expect(then.closing.asOf.getTime()).toBe(lastMonth.end.getTime());
      expect(then.closing.memberBalances).toBe(9_500);
    }),
  );

  test(
    "deposits, wallet payments and payouts are counted where they belong",
    withCleanDb(async () => {
      const finance = await seedUser("FINANCE");
      const member = await seedUser();
      await creditDeposit(member.id, 50_000, "top-1", "USDT");
      await db.payoutAddress.create({
        data: {
          userId: member.id,
          address: "TXyz1234567890abcdefg",
          network: "TRON",
        },
      });
      const asked = await requestWithdrawal(member.id, 20_000);
      if (!asked.ok) throw new Error(asked.reason);
      await settleWithdrawal(asked.withdrawalId, finance.id, "SENT", "0xhash");

      const figures = await monthFigures(monthOf(new Date()));
      expect(figures.deposits.topUps).toEqual({ cents: 50_000, count: 1 });
      expect(figures.deposits.dealPayments.count).toBe(0);
      expect(figures.payouts).toEqual({ cents: 20_000, count: 1 });
      expect(figures.closing.memberBalances).toBe(30_000);
    }),
  );
});

// ---------------------------------------------------------------- position

describe("position", () => {
  test(
    "a running Fastest deal is held for its buyer until it ends",
    withCleanDb(async () => {
      const deal = await paidDeal("FASTEST");

      let position = await moneyPosition();
      expect(position.heldForBuyers).toEqual({ cents: 10_300, count: 1 });
      expect(position.platformOwn).toBe(0);
      expect(position.onHand).toBe(10_300);
      expect(await holdMismatches()).toEqual([]);

      await resolveDeal({
        orderId: deal.orderId,
        to: "REFUNDED",
        byUserId: deal.finance.id,
        note: "Refunded for the test",
      });

      position = await moneyPosition();
      expect(position.heldForBuyers).toEqual({ cents: 0, count: 0 });
      expect(position.memberBalances).toEqual({ cents: 10_300, count: 1 });
      // Still on hand: refunded to a balance, not sent anywhere.
      expect(position.onHand).toBe(10_300);
    }),
  );

  test(
    "the books check catches a Fastest deal whose ledger disagrees",
    withCleanDb(async () => {
      const deal = await completedDeal("FASTEST");
      expect(await holdMismatches()).toEqual([]);

      // Lose the release row: the platform now claims to hold money it has
      // already paid the seller.
      await db.ledgerEntry.deleteMany({
        where: { orderId: deal.orderId, userId: null, kind: "ESCROW_RELEASE" },
      });

      expect(await holdMismatches()).toEqual([
        expect.objectContaining({
          reference: deal.reference,
          status: "COMPLETED",
          heldUsd: 10_300,
          expectedUsd: 0,
        }),
      ]);
    }),
  );

  test(
    "a running Safest deal holds its fee for the buyer",
    withCleanDb(async () => {
      await paidDeal("SAFEST");
      const position = await moneyPosition();
      expect(position.heldForBuyers).toEqual({ cents: 300, count: 1 });
      expect(position.platformOwn).toBe(0);
      expect(await holdMismatches()).toEqual([]);
    }),
  );

  test(
    "a safest hold that does not match its order is reported",
    withCleanDb(async () => {
      const deal = await paidDeal("SAFEST");
      await db.ledgerEntry.create({
        data: {
          orderId: deal.orderId,
          userId: null,
          kind: "ESCROW_HOLD",
          amountUsd: 1,
        },
      });
      expect(await holdMismatches()).toEqual([
        expect.objectContaining({
          reference: deal.reference,
          heldUsd: 301,
          expectedUsd: 300,
        }),
      ]);
    }),
  );
});

// ---------------------------------------------------------------- invoices

describe("invoices", () => {
  test(
    "a settled, unapplied invoice is listed for a human and an applied one is not",
    withCleanDb(async () => {
      const seeded = await seedListing();
      const created = await createDeal({
        listingId: seeded.listing.id,
        buyerId: seeded.buyer.id,
        mode: "FASTEST",
      });
      if (!created.ok) throw new Error(created.reason);

      await db.invoice.create({
        data: {
          reference: created.reference,
          purpose: "DEAL",
          amountUsd: 10_300,
          userId: seeded.buyer.id,
          orderId: created.orderId,
          lastStatus: "paid",
          externalId: "uuid-1",
          settledAt: new Date(),
        },
      });
      await db.invoice.create({
        data: {
          reference: "TOPUP-applied",
          purpose: "TOPUP",
          amountUsd: 5_000,
          userId: seeded.buyer.id,
          lastStatus: "paid",
          settledAt: new Date(),
          appliedAt: new Date(),
        },
      });
      await db.invoice.create({
        data: {
          reference: "TOPUP-pending",
          purpose: "TOPUP",
          amountUsd: 5_000,
          userId: seeded.buyer.id,
          lastStatus: "process",
        },
      });

      const { rows, total } = await listInvoicesNeedingAttention();
      expect(total).toBe(1);
      expect(rows[0]).toMatchObject({
        reference: created.reference,
        problem: "settled-not-applied",
        landed: null,
        order: { status: "AWAITING_PAYMENT" },
      });

      // The deal desk says the same thing on the row.
      const latest = await latestInvoicesFor([created.orderId]);
      expect(
        describeInvoice(latest.get(created.orderId) ?? null),
      ).toMatchObject({
        tone: "danger",
        label: "Paid at the processor, not applied",
      });

      // Once the payment reaches the deal, the row says the money landed.
      await recordOpeningPayment(created.orderId, created.reference, "USDT");
      const after = await listInvoicesNeedingAttention();
      expect(after.rows[0]?.landed).toBe("deal");
    }),
  );

  test(
    "the desk reads a deal's price invoice apart from its fee invoice",
    withCleanDb(async () => {
      const deal = await paidDeal("SAFEST");
      await db.invoice.create({
        data: {
          reference: "DEAL-price-a",
          purpose: "DEAL_PRICE",
          amountUsd: 10_000,
          userId: deal.buyer.id,
          orderId: deal.orderId,
          lastStatus: "check",
          createdAt: new Date(Date.now() - 60_000),
        },
      });
      // A newer fee invoice must not stand in for the price on the desk.
      await db.invoice.create({
        data: {
          reference: "DEAL-fee-b",
          purpose: "DEAL",
          amountUsd: 300,
          userId: deal.buyer.id,
          orderId: deal.orderId,
          lastStatus: "check",
        },
      });
      const price = await latestInvoicesFor([deal.orderId], "DEAL_PRICE");
      expect(price.get(deal.orderId)?.reference).toBe("DEAL-price-a");
      const any = await latestInvoicesFor([deal.orderId]);
      expect(any.get(deal.orderId)?.reference).toBe("DEAL-fee-b");
    }),
  );

  test(
    "a safest price invoice credited to the buyer is marked as landed",
    withCleanDb(async () => {
      const deal = await paidDeal("SAFEST");
      await db.order.update({
        where: { id: deal.orderId },
        data: { agentId: deal.agent.id },
      });
      const actors: Record<string, string> = {
        buyer: deal.buyer.id,
        seller: deal.seller.id,
        agent: deal.agent.id,
      };
      for (const step of templateFor("SAFEST")) {
        if (step.position < 2 || step.position >= 6) continue;
        await runStep({
          orderId: deal.orderId,
          position: step.position,
          userId: actors[step.actor],
        });
      }
      await db.invoice.create({
        data: {
          reference: "DEAL-price-1",
          purpose: "DEAL_PRICE",
          amountUsd: 10_000,
          userId: deal.buyer.id,
          orderId: deal.orderId,
          lastStatus: "paid",
          settledAt: new Date(),
        },
      });
      expect((await listInvoicesNeedingAttention()).rows[0]?.landed).toBeNull();

      // A price paid to us under the old flow becomes the buyer's balance.
      await recordStrayPricePayment(deal.orderId, "DEAL-price-1", "USDT");
      expect((await listInvoicesNeedingAttention()).rows[0]?.landed).toBe(
        "balance",
      );
    }),
  );

  test(
    "a top-up already credited is marked as landed",
    withCleanDb(async () => {
      const member = await seedUser();
      await db.invoice.create({
        data: {
          reference: "TOPUP-abc",
          purpose: "TOPUP",
          amountUsd: 5_000,
          userId: member.id,
          lastStatus: "paid",
          settledAt: new Date(),
        },
      });
      expect((await listInvoicesNeedingAttention()).rows[0]?.landed).toBeNull();

      await creditDeposit(member.id, 5_000, "TOPUP-abc", "USDT");
      expect((await listInvoicesNeedingAttention()).rows[0]?.landed).toBe(
        "balance",
      );
    }),
  );

  test("with checkout switched off, the desk does not blame the buyer", () => {
    // Walked in the browser: the buyer had pressed "Pay with crypto" and
    // been told checkout was off, and the desk said "The buyer has not
    // opened the payment page".
    const off = describeInvoice(null, { checkoutOn: false });
    expect(off.label).toBe("Checkout is switched off");
    expect(off.note).not.toMatch(/has not opened/);
    expect(describeInvoice(null, { checkoutOn: true }).label).toBe(
      "No invoice raised",
    );
  });

  test("each processor state reads as something to do", () => {
    expect(describeInvoice(null).label).toBe("No invoice raised");
    const base = { settledAt: null, appliedAt: null };
    expect(describeInvoice({ ...base, lastStatus: null }).tone).toBe("neutral");
    expect(describeInvoice({ ...base, lastStatus: "wrong_amount" }).tone).toBe(
      "danger",
    );
    expect(describeInvoice({ ...base, lastStatus: "process" }).tone).toBe(
      "info",
    );
    expect(describeInvoice({ ...base, lastStatus: "locked" }).tone).toBe(
      "primary",
    );
    expect(describeInvoice({ ...base, lastStatus: "cancel" }).label).toBe(
      "Invoice failed or expired",
    );
    expect(
      describeInvoice({
        lastStatus: "paid",
        settledAt: new Date(),
        appliedAt: new Date(),
      }).tone,
    ).toBe("verified");
  });
});

// ------------------------------------------------------------- deal lookup

describe("deal lookup", () => {
  test("a reference is recognised however the customer wrote it", () => {
    for (const written of [
      "CA-48213",
      "ca-48213",
      "CA48213",
      "#48213",
      "48213",
      " CA 48213 ",
    ]) {
      expect(referenceFrom(written)).toBe("CA-48213");
    }
    expect(referenceFrom("4821")).toBeNull();
    expect(referenceFrom("CA-482130")).toBeNull();
    expect(referenceFrom("someone@example.com")).toBeNull();
  });

  test(
    "a finished deal is found by reference, by email and by handle",
    withCleanDb(async () => {
      const deal = await completedDeal("SAFEST");
      const digits = deal.reference.slice(3);

      const byRef = await searchDeals(`ca ${digits}`);
      expect(byRef.exact?.id).toBe(deal.orderId);
      expect(byRef.exact?.status).toBe("COMPLETED");

      const byEmail = await searchDeals(deal.buyer.email.toUpperCase());
      expect(byEmail.exact).toBeNull();
      expect(byEmail.rows.map((r) => r.id)).toEqual([deal.orderId]);

      const byHandle = await searchDeals("@test-chan");
      expect(byHandle.rows.map((r) => r.id)).toContain(deal.orderId);

      expect((await searchDeals("nobody-like-this")).total).toBe(0);
      // Too short to mean anything.
      expect((await searchDeals("a")).total).toBe(0);
    }),
  );

  test(
    "the finished view lists ended deals by how they ended, and no live ones",
    withCleanDb(async () => {
      const done = await completedDeal("FASTEST");
      const refunded = await refundedDeal();
      const live = await paidDeal("SAFEST");

      const all = await listFinishedDeals({});
      const ids = all.rows.map((r) => r.id);
      expect(ids).toContain(done.orderId);
      expect(ids).toContain(refunded.orderId);
      expect(ids).not.toContain(live.orderId);
      expect(all.counts).toMatchObject({ COMPLETED: 1, REFUNDED: 1 });

      const onlyRefunded = await listFinishedDeals({ status: "REFUNDED" });
      expect(onlyRefunded.rows.map((r) => r.id)).toEqual([refunded.orderId]);
      expect(onlyRefunded.rows[0]?.endedAt).not.toBeNull();

      // A live status is not a finished filter; it falls back to all.
      expect(
        (await listFinishedDeals({ status: "AWAITING_CUSTODY" })).total,
      ).toBe(2);
    }),
  );
});

// ---------------------------------------------------------------- exports

describe("exports", () => {
  test("csv cells are quoted, and text that a spreadsheet would run is defused", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('say "hi", twice')).toBe('"say ""hi"", twice"');
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell({ numeric: "-12.34" })).toBe("-12.34");
    expect(csvCell(-1234)).toBe("-1234");
    expect(csvCell(null)).toBe("");
  });

  test("cents become a decimal without a float", () => {
    expect(centsToDecimal(0)).toBe("0.00");
    expect(centsToDecimal(5)).toBe("0.05");
    expect(centsToDecimal(-1234)).toBe("-12.34");
    expect(centsToDecimal(1_030_000)).toBe("10300.00");
  });

  test(
    "the ledger export has every row in the month, to the cent",
    withCleanDb(async () => {
      const deal = await completedDeal("FASTEST");
      const month = monthOf(new Date());

      const file = await exportLedger(month, deal.finance.id);
      if (!file.ok) throw new Error("refused");
      const rows = await db.ledgerEntry.count();
      expect(file.rows).toBe(rows);
      expect(file.filename).toBe(`channel-adda-ledger-${month.key}.csv`);

      const lines = file.csv.replace(/^﻿/, "").trim().split("\r\n");
      expect(
        lines[0]?.startsWith(
          "entry_id,created_at_utc,kind,side,amount_usd,amount_cents",
        ),
      ).toBe(true);
      expect(lines).toHaveLength(rows + 1);
      // The hold released on completion, on the platform's side.
      expect(
        lines.some(
          (l) =>
            l.includes(",ESCROW_RELEASE,platform,-103.00,-10300,") &&
            l.includes(deal.reference),
        ),
      ).toBe(true);
      // And the seller's credit, on theirs.
      expect(
        lines.some((l) => l.includes(",ESCROW_RELEASE,member,100.00,10000,")),
      ).toBe(true);
    }),
  );

  test(
    "a member's name cannot become a formula in the accountant's spreadsheet",
    withCleanDb(async () => {
      const finance = await seedUser("FINANCE");
      const member = await db.user.create({
        data: { email: "formula@example.test", name: "=HYPERLINK(1)" },
      });
      await creditDeposit(member.id, 1_000, "dep-formula", "USDT");

      const file = await exportLedger(monthOf(new Date()), finance.id);
      if (!file.ok) throw new Error("refused");
      expect(file.csv).toContain(",'=HYPERLINK(1),");
      expect(file.csv).not.toContain(",=HYPERLINK(1),");
    }),
  );

  test(
    "the payout export has the payouts sent in the month and nothing pending",
    withCleanDb(async () => {
      const finance = await seedUser("FINANCE");
      const member = await seedUser();
      await creditDeposit(member.id, 50_000, "dep-payout", "USDT");
      await db.payoutAddress.create({
        data: {
          userId: member.id,
          address: "TXyz1234567890abcdefg",
          network: "TRON",
        },
      });
      const sent = await requestWithdrawal(member.id, 20_000);
      const waiting = await requestWithdrawal(member.id, 5_000);
      if (!sent.ok || !waiting.ok) throw new Error("setup");
      await settleWithdrawal(sent.withdrawalId, finance.id, "SENT", "0xfeed");

      const file = await exportPayouts(monthOf(new Date()), finance.id);
      if (!file.ok) throw new Error("refused");
      expect(file.rows).toBe(1);
      expect(file.csv).toContain(sent.withdrawalId);
      expect(file.csv).toContain(",200.00,20000,");
      expect(file.csv).toContain("0xfeed");
      expect(file.csv).toContain(finance.name);
      expect(file.csv).not.toContain(waiting.withdrawalId);
    }),
  );

  test(
    "a non-finance user is refused both exports",
    withCleanDb(async () => {
      const month = monthOf(new Date());
      for (const role of ["USER", "AGENT", "MODERATOR"] as const) {
        const someone = await seedUser(role);
        expect(await exportLedger(month, someone.id)).toEqual({ ok: false });
        expect(await exportPayouts(month, someone.id)).toEqual({ ok: false });
      }

      // A suspended finance account is refused too.
      const suspended = await seedUser("FINANCE");
      await db.user.update({
        where: { id: suspended.id },
        data: { bannedAt: new Date() },
      });
      expect(await exportLedger(month, suspended.id)).toEqual({ ok: false });

      const superadmin = await seedUser("SUPERADMIN");
      expect((await exportLedger(month, superadmin.id)).ok).toBe(true);
    }),
  );
});
