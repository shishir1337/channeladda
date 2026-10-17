import { beforeEach, expect, test, vi } from "vitest";
import { db } from "@/lib/db";
import { seedListing, seedUser, withCleanDb } from "@/test/db";

// What the processor answers is the whole question here, so it is the one
// thing replaced. Everything else — the queue, the give-up, the audit row —
// is the real code against the test database.
const lookup = vi.hoisted(() => vi.fn());
vi.mock("@/server/cryptomus", async (original) => ({
  ...(await original<typeof import("@/server/cryptomus")>()),
  lookupInvoice: lookup,
}));

const { reconcileInvoices } = await import("@/server/invoices");

beforeEach(() => {
  lookup.mockReset();
});

const THREE_DAYS_AGO = () => new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

async function oldTopUp(reference: string) {
  const user = await seedUser();
  const old = THREE_DAYS_AGO();
  await db.invoice.create({
    data: {
      reference,
      purpose: "TOPUP",
      amountUsd: 5_000,
      userId: user.id,
      createdAt: old,
      updatedAt: old,
    },
  });
  return { user, old };
}

test(
  "an old invoice the processor says does not exist is given up on",
  withCleanDb(async () => {
    lookup.mockResolvedValue({ kind: "missing" });
    await oldTopUp("TOPUP-MISSING");

    await reconcileInvoices();

    const row = await db.invoice.findUniqueOrThrow({
      where: { reference: "TOPUP-MISSING" },
    });
    expect(row.appliedAt).not.toBeNull();
    expect(
      await db.auditLog.count({
        where: { action: "payment.never_registered" },
      }),
    ).toBe(1);
  }),
);

test(
  "an old invoice is kept when the processor cannot be asked",
  withCleanDb(async () => {
    // An outage, a timeout, a revoked key: none of them is the processor
    // saying "no such invoice", and a paid invoice must survive all of them.
    lookup.mockResolvedValue({ kind: "unknown" });
    const { old } = await oldTopUp("TOPUP-OUTAGE");

    await reconcileInvoices();

    const row = await db.invoice.findUniqueOrThrow({
      where: { reference: "TOPUP-OUTAGE" },
    });
    expect(row.appliedAt).toBeNull();
    expect(row.updatedAt.getTime()).toBeGreaterThan(old.getTime());
    expect(
      await db.auditLog.count({
        where: { action: "payment.never_registered" },
      }),
    ).toBe(0);
  }),
);

test(
  "an invoice the processor once reported on is never given up as unknown",
  withCleanDb(async () => {
    // A callback arrived for it, so it did exist there; a later "not found"
    // is the processor's problem, not proof there was nothing to pay.
    lookup.mockResolvedValue({ kind: "missing" });
    await oldTopUp("TOPUP-SEEN");
    await db.invoice.update({
      where: { reference: "TOPUP-SEEN" },
      data: { lastStatus: "check" },
    });

    await reconcileInvoices();

    const row = await db.invoice.findUniqueOrThrow({
      where: { reference: "TOPUP-SEEN" },
    });
    expect(row.appliedAt).toBeNull();
  }),
);

test(
  "a second payment the sweep confirms is credited to the buyer, not just closed",
  withCleanDb(async () => {
    // The buyer paid the deal one way, then a crypto invoice for the same
    // deal was paid too and its callback was lost. Only the sweep sees it.
    // It used to call recordOpeningPayment, ignore the answer, and mark the
    // invoice applied: the second-payment credit needs a settled invoice,
    // the sweep never stamped one, so nothing was booked — and the invoice
    // left the "paid, not applied" list for good.
    const { createDeal, recordOpeningPayment } = await import("@/server/deals");
    const seeded = await seedListing();
    const deal = await createDeal({
      listingId: seeded.listing.id,
      buyerId: seeded.buyer.id,
      mode: "FASTEST",
    });
    if (!deal.ok) throw new Error(deal.reason);

    await db.invoice.create({
      data: {
        reference: deal.reference,
        orderId: deal.orderId,
        userId: seeded.buyer.id,
        purpose: "DEAL",
        amountUsd: 10_300,
        settledAt: new Date(),
        lastStatus: "paid",
        appliedAt: new Date(),
      },
    });
    await recordOpeningPayment(deal.orderId, deal.reference, "USDT");

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    await db.invoice.create({
      data: {
        reference: "CA-77777",
        orderId: deal.orderId,
        userId: seeded.buyer.id,
        purpose: "DEAL",
        amountUsd: 10_300,
        createdAt: tenMinutesAgo,
        updatedAt: tenMinutesAgo,
      },
    });
    lookup.mockResolvedValue({
      kind: "found",
      invoice: {
        status: "paid",
        isFinal: true,
        paidAmountUsd: 10_300,
        payerCurrency: "USDT",
      },
    });

    expect(await reconcileInvoices()).toBe(1);

    const credited = await db.ledgerEntry.aggregate({
      where: { userId: seeded.buyer.id, externalRef: "overpay:CA-77777" },
      _sum: { amountUsd: true },
    });
    expect(credited._sum.amountUsd).toBe(10_300);
    const row = await db.invoice.findUniqueOrThrow({
      where: { reference: "CA-77777" },
    });
    expect(row.appliedAt).not.toBeNull();
    expect(row.settledAt).not.toBeNull();
  }),
);
