import { beforeEach, expect, test, vi } from "vitest";
import { signPayload } from "@/lib/cryptomus-sign";
import { db } from "@/lib/db";
import { templateFor } from "@/lib/deal-templates";
import {
  balanceOf,
  createDeal,
  recordOpeningPayment,
  resolveDeal,
} from "@/server/deals";
import { reconcileInvoice } from "@/server/invoices";
import { seedListing, seedUser, withCleanDb } from "@/test/db";
import { runStep } from "@/test/deal-steps";

// Cryptomus as observed against the live API on 2026-10-17: asking for an
// invoice under an order_id it has already seen returns that same invoice —
// still open within its hour, and the same cancelled, final invoice after
// it. Only the processor is replaced; the action, the webhook route, the
// sweep and the database are real.
const fake = vi.hoisted(() => ({
  buyerId: "",
  invoices: new Map<
    string,
    {
      uuid: string;
      amountUsd: number;
      status: string;
      isFinal: boolean;
      /** What the payer actually sent, when it is not the invoice amount. */
      paid?: number;
    }
  >(),
  created: [] as string[],
  /** Where the last checkout sends the payer once they have paid. */
  lastSuccessUrl: "",
}));

vi.mock("@/server/session", () => ({
  requireUser: async () => ({ id: fake.buyerId, role: "USER" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/cryptomus", async (original) => {
  const real = await original<typeof import("@/server/cryptomus")>();
  const state = (row: {
    amountUsd: number;
    status: string;
    isFinal: boolean;
    paid?: number;
  }) => ({
    status: row.status,
    isFinal: row.isFinal,
    paidAmountUsd: row.status === "paid" ? (row.paid ?? row.amountUsd) : null,
    payerCurrency: row.status === "paid" ? "USDT" : null,
  });
  return {
    ...real,
    isConfigured: () => true,
    cryptomusConfig: () => ({
      merchantId: "test-merchant",
      paymentKey: "test-payment-key",
    }),
    createInvoice: async (request: {
      orderId: string;
      amountUsd: number;
      successUrl: string;
    }) => {
      fake.lastSuccessUrl = request.successUrl;
      let row = fake.invoices.get(request.orderId);
      if (!row) {
        row = {
          uuid: `uuid-${fake.invoices.size + 1}`,
          amountUsd: request.amountUsd,
          status: "check",
          isFinal: false,
        };
        fake.invoices.set(request.orderId, row);
        fake.created.push(request.orderId);
      }
      return {
        uuid: row.uuid,
        url: `https://pay.example.test/${row.uuid}`,
        orderId: request.orderId,
        status: row.status,
        isFinal: row.isFinal,
        expiresAt: null,
      };
    },
    lookupInvoice: async (orderId: string) => {
      const row = fake.invoices.get(orderId);
      return row
        ? { kind: "found" as const, invoice: state(row) }
        : { kind: "missing" as const };
    },
    getInvoice: async (orderId: string) => {
      const row = fake.invoices.get(orderId);
      return row ? state(row) : null;
    },
  };
});

const { startPayment } = await import("@/server/actions/payments");
const { startTopUp } = await import("@/server/actions/wallet");
const { POST } = await import("@/app/api/webhooks/cryptomus/route");

beforeEach(() => {
  fake.invoices.clear();
  fake.created.length = 0;
});

async function dealAwaitingPayment() {
  const seeded = await seedListing();
  const created = await createDeal({
    listingId: seeded.listing.id,
    buyerId: seeded.buyer.id,
    mode: "FASTEST",
  });
  if (!created.ok) throw new Error(created.reason);
  fake.buyerId = seeded.buyer.id;
  return db.order.findUniqueOrThrow({
    where: { id: created.orderId },
    select: { id: true, reference: true, totalUsd: true },
  });
}

function settle(
  orderId: string,
  status: string,
  isFinal: boolean,
  paid?: number,
) {
  const row = fake.invoices.get(orderId);
  if (!row) throw new Error(`no invoice ${orderId}`);
  row.status = status;
  row.isFinal = isFinal;
  row.paid = paid;
}

/** A Safest deal whose fee is paid, inspected, and waiting on its price. */
async function safestAwaitingPrice() {
  const seeded = await seedListing();
  const created = await createDeal({
    listingId: seeded.listing.id,
    buyerId: seeded.buyer.id,
    mode: "SAFEST",
  });
  if (!created.ok) throw new Error(created.reason);
  fake.buyerId = seeded.buyer.id;
  await db.order.update({
    where: { id: created.orderId },
    data: { agentId: seeded.agent.id },
  });
  await recordOpeningPayment(created.orderId, created.reference, "USDT");
  const actors: Record<string, string> = {
    buyer: seeded.buyer.id,
    seller: seeded.seller.id,
    agent: seeded.agent.id,
  };
  for (const step of templateFor("SAFEST")) {
    if (step.position < 2 || step.position >= 6) continue;
    const r = await runStep({
      orderId: created.orderId,
      position: step.position,
      userId: actors[step.actor],
    });
    if (!r.ok) throw new Error(`step ${step.position}: ${r.reason}`);
  }
  return { ...seeded, orderId: created.orderId };
}

async function priceHeld(orderId: string) {
  return db.ledgerEntry.count({
    where: { orderId, userId: null, note: { contains: "price" } },
  });
}

test(
  "pressing Pay again within the hour opens the same payment page",
  withCleanDb(async () => {
    const order = await dealAwaitingPayment();

    const first = await startPayment(order.id);
    const second = await startPayment(order.id);

    expect(first.ok && second.ok && first.url === second.url).toBe(true);
    expect(fake.created).toHaveLength(1);
    // Never the deal's own five-digit reference: Cryptomus keeps order_ids
    // for ever, per merchant, and staging shares the owner's merchant, so a
    // reused CA-12345 would hand a production buyer a staging invoice.
    expect(fake.created[0]).not.toBe(order.reference);
  }),
);

test(
  "pressing Pay after the first invoice expired opens a new one",
  withCleanDb(async () => {
    // A deal waits 48 hours for payment and an invoice lives one. Reusing
    // the deal's reference sent every later press to the same cancelled
    // page, so a buyer who came back after an hour could not pay at all.
    const order = await dealAwaitingPayment();

    const first = await startPayment(order.id);
    settle(fake.created[0], "cancel", true);
    const second = await startPayment(order.id);

    expect(second.ok).toBe(true);
    expect(first.ok && second.ok && second.url !== first.url).toBe(true);
    expect(fake.created).toHaveLength(2);
    const rows = await db.invoice.findMany({ where: { orderId: order.id } });
    expect(rows.map((row) => row.reference).sort()).toEqual(
      [...fake.created].sort(),
    );
  }),
);

test(
  "a payment Cryptomus already took is booked rather than charged again",
  withCleanDb(async () => {
    // Paid, and the callback has not arrived yet. A second invoice here
    // would ask the buyer to pay twice; the right answer is the first one.
    const order = await dealAwaitingPayment();

    await startPayment(order.id);
    settle(fake.created[0], "paid", true);
    const again = await startPayment(order.id);

    expect(again.ok).toBe(false);
    expect(fake.created).toHaveLength(1);
    const booked = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { paymentRef: true, status: true },
    });
    expect(booked.paymentRef).toBe(fake.created[0]);
    expect(booked.status).not.toBe("AWAITING_PAYMENT");
  }),
);

test(
  "a paid callback for a retried invoice books the deal it belongs to",
  withCleanDb(async () => {
    const order = await dealAwaitingPayment();
    await startPayment(order.id);
    settle(fake.created[0], "cancel", true);
    await startPayment(order.id);
    const retried = fake.created[1];
    settle(retried, "paid", true);

    const body = {
      type: "payment",
      uuid: fake.invoices.get(retried)?.uuid,
      order_id: retried,
      status: "paid",
      is_final: true,
      payment_amount_usd: (order.totalUsd / 100).toFixed(2),
      payer_currency: "USDT",
    };
    const response = await POST(
      new Request("http://localhost/api/webhooks/cryptomus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          sign: signPayload(body, "test-payment-key"),
        }),
      }),
    );

    expect(response.status).toBe(200);
    const booked = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { paymentRef: true },
    });
    expect(booked.paymentRef).toBe(retried);
  }),
);

// ------------------------------------------------- the Safest price, by crypto

test(
  "a price checkout raises an invoice for the price",
  withCleanDb(async () => {
    const { orderId } = await safestAwaitingPrice();

    const started = await startPayment(orderId);
    expect(started.ok).toBe(true);

    const invoice = await db.invoice.findFirstOrThrow({
      where: { orderId, purpose: "DEAL_PRICE" },
    });
    expect(invoice.amountUsd).toBe(10_000);
    expect(fake.invoices.get(invoice.reference)?.amountUsd).toBe(10_000);
  }),
);

test(
  "a price checkout never reuses the fee invoice",
  withCleanDb(async () => {
    // The buyer opened a fee checkout, then paid the fee another way. That
    // invoice is still open and unapplied; reusing it for the price would
    // send them to a page asking for the fee.
    const seeded = await seedListing();
    const created = await createDeal({
      listingId: seeded.listing.id,
      buyerId: seeded.buyer.id,
      mode: "SAFEST",
    });
    if (!created.ok) throw new Error(created.reason);
    fake.buyerId = seeded.buyer.id;
    await startPayment(created.orderId);
    const feeInvoice = fake.created[0];
    await db.order.update({
      where: { id: created.orderId },
      data: { agentId: seeded.agent.id },
    });
    await recordOpeningPayment(created.orderId, created.reference, "USDT");
    const actors: Record<string, string> = {
      buyer: seeded.buyer.id,
      seller: seeded.seller.id,
      agent: seeded.agent.id,
    };
    for (const step of templateFor("SAFEST")) {
      if (step.position < 2 || step.position >= 6) continue;
      await runStep({
        orderId: created.orderId,
        position: step.position,
        userId: actors[step.actor],
      });
    }

    expect((await startPayment(created.orderId)).ok).toBe(true);
    expect(fake.created).toHaveLength(2);
    expect(fake.created[1]).not.toBe(feeInvoice);
    expect(fake.invoices.get(fake.created[1])?.amountUsd).toBe(10_000);
  }),
);

test(
  "a settled price invoice moves the deal through reconciliation",
  withCleanDb(async () => {
    const { orderId } = await safestAwaitingPrice();
    await startPayment(orderId);
    const reference = fake.created[0];
    settle(reference, "paid", true);

    expect(await reconcileInvoice(reference)).toBe("applied");

    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("AWAITING_HANDOVER");
    expect(order.buyerPaymentRef).toBe(reference);
    expect(await priceHeld(orderId)).toBe(1);
  }),
);

test(
  "a paid callback for a price invoice books the price",
  withCleanDb(async () => {
    const { orderId } = await safestAwaitingPrice();
    await startPayment(orderId);
    const reference = fake.created[0];
    settle(reference, "paid", true);

    const body = {
      type: "payment",
      uuid: fake.invoices.get(reference)?.uuid,
      order_id: reference,
      status: "paid",
      is_final: true,
      payment_amount_usd: "100.00",
      payer_currency: "USDT",
    };
    const response = await POST(
      new Request("http://localhost/api/webhooks/cryptomus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          sign: signPayload(body, "test-payment-key"),
        }),
      }),
    );

    expect(response.status).toBe(200);
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("AWAITING_HANDOVER");
    expect(order.buyerPaymentRef).toBe(reference);
    // The opening payment's name is untouched.
    expect(order.paymentRef).not.toBe(reference);
  }),
);

test(
  "an underpaid price invoice does not move the deal",
  withCleanDb(async () => {
    // Paid at least the fee, but nowhere near the price. Checked against
    // the deal's up-front total — the fee — this would have bought the
    // channel transfer for $3.
    const { orderId } = await safestAwaitingPrice();
    await startPayment(orderId);
    const reference = fake.created[0];
    settle(reference, "paid", true, 300);

    expect(await reconcileInvoice(reference)).toBe("not-yet");

    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("AWAITING_BUYER_PAYMENT");
    expect(order.buyerPaymentRef).toBeNull();
    expect(await priceHeld(orderId)).toBe(0);
  }),
);

test(
  "a late price payment is credited at the price",
  withCleanDb(async () => {
    // The buyer opened the price checkout and the deal was returned before
    // the money arrived. It is real money, and it is the price, not the fee.
    const { orderId, buyer } = await safestAwaitingPrice();
    await startPayment(orderId);
    const reference = fake.created[0];
    const finance = await seedUser("FINANCE");
    const returned = await resolveDeal({
      orderId,
      to: "RETURNED_TO_SELLER",
      byUserId: finance.id,
      note: "buyer went quiet",
    });
    expect(returned).toMatchObject({ ok: true });

    settle(reference, "paid", true);
    await reconcileInvoice(reference);
    await reconcileInvoice(reference);

    expect(await balanceOf(buyer.id)).toBe(10_000);
    expect(
      await db.ledgerEntry.count({
        where: { userId: buyer.id, kind: "DEPOSIT" },
      }),
    ).toBe(1);
  }),
);

test(
  "a top-up started from a deal goes back to that deal, and only to this site",
  withCleanDb(async () => {
    const seeded = await seedListing();
    fake.buyerId = seeded.buyer.id;

    expect((await startTopUp(41.5, "/dashboard/deals/abc")).ok).toBe(true);
    expect(fake.lastSuccessUrl.endsWith("/dashboard/deals/abc")).toBe(true);

    // Anything that is not a path on this site goes back to the wallet.
    await startTopUp(41.5, "//evil.example/x");
    expect(fake.lastSuccessUrl.endsWith("/dashboard/wallet?topped=1")).toBe(
      true,
    );
  }),
);
