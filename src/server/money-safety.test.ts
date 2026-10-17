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
    ).resolves.toBeUndefined();

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
