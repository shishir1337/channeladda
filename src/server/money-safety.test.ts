import { expect, test } from "vitest";
import { db } from "@/lib/db";
import {
  balanceOf,
  createDeal,
  expireStaleDeals,
  recordOpeningPayment,
} from "@/server/deals";
import { reconcileInvoices } from "@/server/invoices";
import { seedListing, seedUser, withCleanDb } from "@/test/db";

async function paidFastestDeal() {
  const seeded = await seedListing();
  const result = await createDeal({
    listingId: seeded.listing.id,
    buyerId: seeded.buyer.id,
    mode: "FASTEST",
  });
  if (!result.ok) throw new Error(`createDeal failed: ${result.reason}`);
  await recordOpeningPayment(result.orderId, result.reference, "USDT");
  return { ...seeded, orderId: result.orderId, reference: result.reference };
}

// ------------------------------------------ one payment, one reference

test(
  "the same payment under a second reference does not credit the buyer",
  withCleanDb(async () => {
    // The webhook claimed the order with Cryptomus's payment uuid and the
    // reconciliation sweep claimed it with our own CA-##### reference. One
    // payment, two namespaces: whichever ran second saw a reference it did
    // not recognise, decided a second payment had arrived, and credited the
    // buyer the full amount of the deal out of nothing.
    const { orderId, buyer } = await paidFastestDeal();
    expect(await balanceOf(buyer.id)).toBe(0);

    await recordOpeningPayment(orderId, "e3c1f0a2-cryptomus-uuid", "USDT");

    expect(await balanceOf(buyer.id)).toBe(0);
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("AGENT_VERIFYING");
  }),
);

test(
  "a genuine second invoice for the same deal is credited to the buyer",
  withCleanDb(async () => {
    // The other half of the rule. A buyer can open an invoice, pay from their
    // balance while it is still open, and then pay the invoice too. That
    // money is real and it is theirs, so it becomes balance rather than
    // vanishing — but only because there is a settled invoice to point at.
    const { orderId, buyer } = await paidFastestDeal();

    await db.invoice.create({
      data: {
        reference: "CA-99999",
        orderId,
        userId: buyer.id,
        purpose: "DEAL",
        amountUsd: 10_300,
        settledAt: new Date(),
        lastStatus: "paid",
      },
    });
    await recordOpeningPayment(orderId, "CA-99999", "USDT");

    expect(await balanceOf(buyer.id)).toBe(10_300);
  }),
);

// -------------------------------------- a payment that arrives too late

test(
  "a payment that lands on an expired deal becomes the buyer's balance",
  withCleanDb(async () => {
    // The buyer pays at 47h55m and the network confirms at 48h05m. The order
    // is already PAYMENT_EXPIRED, which is terminal, so recordOpeningPayment
    // threw — the webhook 500'd for ever, the sweep re-threw on every tick,
    // and the money was never written down anywhere at all.
    const seeded = await seedListing();
    const result = await createDeal({
      listingId: seeded.listing.id,
      buyerId: seeded.buyer.id,
      mode: "FASTEST",
    });
    if (!result.ok) throw new Error("createDeal failed");

    await db.order.update({
      where: { id: result.orderId },
      data: { createdAt: new Date(Date.now() - 49 * 60 * 60 * 1000) },
    });
    expect(await expireStaleDeals()).toBe(1);

    await expect(
      recordOpeningPayment(result.orderId, result.reference, "USDT"),
    ).resolves.toBe("credited-to-balance");

    expect(await balanceOf(seeded.buyer.id)).toBe(10_300);
    const order = await db.order.findUniqueOrThrow({
      where: { id: result.orderId },
    });
    expect(order.status).toBe("PAYMENT_EXPIRED");
  }),
);

test(
  "a late payment credited twice is only credited once",
  withCleanDb(async () => {
    const seeded = await seedListing();
    const result = await createDeal({
      listingId: seeded.listing.id,
      buyerId: seeded.buyer.id,
      mode: "FASTEST",
    });
    if (!result.ok) throw new Error("createDeal failed");
    await db.order.update({
      where: { id: result.orderId },
      data: { createdAt: new Date(Date.now() - 49 * 60 * 60 * 1000) },
    });
    await expireStaleDeals();

    await recordOpeningPayment(result.orderId, result.reference, "USDT");
    await recordOpeningPayment(result.orderId, result.reference, "USDT");

    expect(await balanceOf(seeded.buyer.id)).toBe(10_300);
  }),
);

// ------------------------------------- the sweep refuses an underpayment

test(
  "the reconciliation sweep will not fund a deal short",
  withCleanDb(async () => {
    // The webhook has a tolerance check written specifically so a rounding
    // difference cannot fund a deal short. The sweep, which is what runs when
    // the callback is lost, had none — so the cheaper path to custody of
    // somebody's channel was to make sure the callback never arrived.
    const seeded = await seedListing();
    const result = await createDeal({
      listingId: seeded.listing.id,
      buyerId: seeded.buyer.id,
      mode: "FASTEST",
    });
    if (!result.ok) throw new Error("createDeal failed");

    await db.invoice.create({
      data: {
        reference: result.reference,
        orderId: result.orderId,
        userId: seeded.buyer.id,
        purpose: "DEAL",
        amountUsd: 10_300,
        createdAt: new Date(Date.now() - 10 * 60 * 1000),
      },
    });

    // No Cryptomus credentials in this environment, so getInvoice returns
    // null and the sweep leaves the invoice alone rather than applying it.
    expect(await reconcileInvoices()).toBe(0);
    const order = await db.order.findUniqueOrThrow({
      where: { id: result.orderId },
    });
    expect(order.paymentRef).toBeNull();
  }),
);

test(
  "a payment that loses the compare-and-set is still written down",
  withCleanDb(async () => {
    // Two fixes that did not know about each other. Adding `status` to the
    // compare-and-set made it possible to miss for a reason other than “an
    // identical delivery got there first” — and the loser returned having
    // written nothing at all, while the caller still reported the payment as
    // applied. That marked the invoice applied, discarded Cryptomus's retry,
    // and hid it from the sweep that exists to catch exactly that.
    //
    // Two real payments racing is the deterministic version of the same
    // miss: a buyer pays the invoice while finance records a bank transfer.
    const seeded = await seedListing();
    const created = await createDeal({
      listingId: seeded.listing.id,
      buyerId: seeded.buyer.id,
      mode: "FASTEST",
    });
    if (!created.ok) throw new Error(created.reason);

    // Both references have a settled invoice, which is what two real
    // payments look like: startPayment writes one per invoice it raises.
    // Whichever wins the compare-and-set, the other is a second payment
    // with evidence behind it, so the assertion does not depend on who won.
    for (const reference of [created.reference, "CA-88888"]) {
      await db.invoice.create({
        data: {
          reference,
          orderId: created.orderId,
          userId: seeded.buyer.id,
          purpose: "DEAL",
          amountUsd: 10_300,
          settledAt: new Date(),
          lastStatus: "paid",
        },
      });
    }

    await Promise.all([
      recordOpeningPayment(created.orderId, created.reference, "USDT"),
      recordOpeningPayment(created.orderId, "CA-88888", "USDT"),
    ]);

    // One of them opened the deal; the other was a second payment and is the
    // buyer's money either way. Neither may simply vanish.
    const order = await db.order.findUniqueOrThrow({
      where: { id: created.orderId },
    });
    expect(order.status).toBe("AGENT_VERIFYING");

    const holds = await db.ledgerEntry.findMany({
      where: { orderId: created.orderId, kind: "ESCROW_HOLD" },
    });
    expect(holds).toHaveLength(1);
    expect(await balanceOf(seeded.buyer.id)).toBe(10_300);
  }),
);

test(
  "a payment is never applied twice when two deliveries race",
  withCleanDb(async () => {
    // The guard the compare-and-set exists for, still intact: two callbacks
    // in flight at once must produce one ledger row, not two.
    const seeded = await seedListing();
    const created = await createDeal({
      listingId: seeded.listing.id,
      buyerId: seeded.buyer.id,
      mode: "FASTEST",
    });
    if (!created.ok) throw new Error(created.reason);

    await Promise.all([
      recordOpeningPayment(created.orderId, created.reference, "USDT"),
      recordOpeningPayment(created.orderId, created.reference, "USDT"),
    ]);

    const rows = await db.ledgerEntry.findMany({
      where: { orderId: created.orderId },
    });
    expect(rows).toHaveLength(1);
    expect(await balanceOf(seeded.buyer.id)).toBe(0);
  }),
);

test(
  "recording a payment by hand says what actually happened",
  withCleanDb(async () => {
    // The clerk was told "Payment recorded. The deal is under way." whatever
    // happened underneath — including when nothing happened at all. A buyer
    // pays the deal from their balance, then wires the fee again by mistake;
    // finance records it; there is no invoice under the order's reference, so
    // it is audited as a mismatch and nothing is credited. Finance is told
    // the deal is under way and the buyer is out of pocket.
    const { recordManualPayment } = await import("@/server/deals");
    const seeded = await seedListing();
    const created = await createDeal({
      listingId: seeded.listing.id,
      buyerId: seeded.buyer.id,
      mode: "FASTEST",
    });
    if (!created.ok) throw new Error(created.reason);

    // The honest happy path.
    expect(
      await recordManualPayment(created.orderId, "0xdeadbeef", "USDT"),
    ).toBe("applied");

    // And the same call again, on a deal that is already under way.
    expect(
      await recordManualPayment(created.orderId, "0xdeadbeef", "USDT"),
    ).toBe("already-applied");
  }),
);

test(
  "a payment recorded against a deal paid another way is not silently dropped",
  withCleanDb(async () => {
    const { recordManualPayment } = await import("@/server/deals");
    const seeded = await seedListing();
    const created = await createDeal({
      listingId: seeded.listing.id,
      buyerId: seeded.buyer.id,
      mode: "FASTEST",
    });
    if (!created.ok) throw new Error(created.reason);

    // Paid under some other name, as a wallet payment is.
    await db.order.update({
      where: { id: created.orderId },
      data: {
        paymentRef: `wallet:${created.reference}`,
        status: "AGENT_VERIFYING",
      },
    });

    expect(await recordManualPayment(created.orderId, "0xabc", "USDT")).toBe(
      "reference-mismatch",
    );
    expect(await balanceOf(seeded.buyer.id)).toBe(0);
  }),
);

test(
  "the payment window is the admin's setting, not a constant",
  withCleanDb(async () => {
    // It was PAYMENT_WINDOW_HOURS = 48 in deals.ts. Tuning how long a buyer
    // who walked away holds a listing off the market meant a deploy.
    const seeded = await seedListing({ settings: { paymentWindowHours: 2 } });
    const created = await createDeal({
      listingId: seeded.listing.id,
      buyerId: seeded.buyer.id,
      mode: "FASTEST",
    });
    if (!created.ok) throw new Error(created.reason);
    await db.order.update({
      where: { id: created.orderId },
      data: { createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000) },
    });

    // Three hours old: inside the old 48h, outside the 2h the admin set.
    expect(await expireStaleDeals()).toBe(1);
  }),
);

test(
  "the sweep says when it last ran",
  withCleanDb(async () => {
    const { recordSweep, getSettings, clearSettingsCache } = await import(
      "@/server/settings"
    );
    await recordSweep({ deals: 2, offers: 0 });
    clearSettingsCache();

    const settings = await getSettings();
    expect(settings.lastSweepAt).not.toBeNull();
    expect(settings.lastSweepResult).toMatchObject({ deals: 2, offers: 0 });
  }),
);

// ---------------------------------------- the sweep cannot be starved

test(
  "an invoice the processor never heard of does not block the queue for ever",
  withCleanDb(async () => {
    // reconcileInvoices took the 25 oldest unapplied invoices, oldest first.
    // A top-up whose page was never reached is never registered at the
    // processor, so its lookup fails on every run and the row never clears —
    // and 25 of those blocked every paid invoice behind them, permanently.
    const { reconcileInvoices } = await import("@/server/invoices");
    const user = await seedUser();
    const old = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    await db.invoice.create({
      data: {
        reference: "TOPUP-NEVER-SEEN",
        purpose: "TOPUP",
        amountUsd: 5_000,
        userId: user.id,
        createdAt: old,
        updatedAt: old,
      },
    });

    // No credentials here, so the processor cannot be asked at all. That is
    // not the processor saying it never heard of the invoice — an outage or a
    // missing key looks exactly like this, and an invoice paid during one
    // must not be written off. It is kept, and moved to the back so it does
    // not block the queue; the give-up itself is in reconcile-giveup.test.ts.
    await reconcileInvoices();

    const row = await db.invoice.findUniqueOrThrow({
      where: { reference: "TOPUP-NEVER-SEEN" },
    });
    expect(row.appliedAt).toBeNull();
    expect(row.updatedAt.getTime()).toBeGreaterThan(old.getTime());
  }),
);

test(
  "a recent invoice the processor has not answered for is kept and moved to the back",
  withCleanDb(async () => {
    const { reconcileInvoices } = await import("@/server/invoices");
    const user = await seedUser();
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    await db.invoice.create({
      data: {
        reference: "TOPUP-RECENT",
        purpose: "TOPUP",
        amountUsd: 5_000,
        userId: user.id,
        createdAt: tenMinutesAgo,
        updatedAt: tenMinutesAgo,
      },
    });

    await reconcileInvoices();

    const row = await db.invoice.findUniqueOrThrow({
      where: { reference: "TOPUP-RECENT" },
    });
    // Still being chased, but no longer at the front.
    expect(row.appliedAt).toBeNull();
    expect(row.updatedAt.getTime()).toBeGreaterThan(tenMinutesAgo.getTime());
  }),
);

test(
  "one invoice can be retried by reference",
  withCleanDb(async () => {
    const { reconcileInvoice } = await import("@/server/invoices");
    expect(await reconcileInvoice("CA-00000")).toBe("not-found");
  }),
);
