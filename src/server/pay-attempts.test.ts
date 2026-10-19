import { beforeEach, expect, test, vi } from "vitest";
import { signPayload } from "@/lib/cryptomus-sign";
import { db } from "@/lib/db";
import { templateFor } from "@/lib/deal-templates";
import { balanceOf, createDeal, recordOpeningPayment } from "@/server/deals";
import { reconcileInvoice } from "@/server/invoices";
import { seedListing, withCleanDb } from "@/test/db";
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

/** A Safest deal whose fee is paid and whose channel our agent now holds. */
async function safestInCustody() {
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

/**
 * A Safest price invoice raised before the price went to the seller
 * directly, paid at the processor: the one way a price can still reach us.
 */
async function legacyPriceInvoice(orderId: string, buyerId: string) {
  const reference = `PRICE-${orderId}`;
  await db.invoice.create({
    data: {
      reference,
      purpose: "DEAL_PRICE",
      amountUsd: 10_000,
      userId: buyerId,
      orderId,
    },
  });
  fake.invoices.set(reference, {
    uuid: `uuid-${reference}`,
    amountUsd: 10_000,
    status: "paid",
    isFinal: true,
  });
  return reference;
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
  "a safest deal in custody has nothing to pay Channel Adda",
  withCleanDb(async () => {
    // The buyer pays the seller directly now; there is no price checkout.
    const { orderId } = await safestInCustody();

    const started = await startPayment(orderId);
    expect(started).toMatchObject({ ok: false });
    expect(fake.created).toHaveLength(0);
    expect(
      await db.invoice.count({ where: { orderId, purpose: "DEAL_PRICE" } }),
    ).toBe(0);
  }),
);

test(
  "a price invoice from before is credited to the buyer when it settles",
  withCleanDb(async () => {
    const { orderId, buyer } = await safestInCustody();
    const reference = await legacyPriceInvoice(orderId, buyer.id);

    expect(await reconcileInvoice(reference)).toBe("applied");
    await reconcileInvoice(reference);

    expect(await balanceOf(buyer.id)).toBe(10_000);
    expect(
      await db.ledgerEntry.count({
        where: { userId: buyer.id, kind: "DEPOSIT" },
      }),
    ).toBe(1);
    // It starts nothing: the deal is where it was.
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("IN_CUSTODY");
    expect(order.buyerPaidAt).toBeNull();
  }),
);

test(
  "a paid callback for a price invoice from before credits the buyer",
  withCleanDb(async () => {
    const { orderId, buyer } = await safestInCustody();
    const reference = await legacyPriceInvoice(orderId, buyer.id);

    const body = {
      type: "payment",
      uuid: `uuid-${reference}`,
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
    expect(await balanceOf(buyer.id)).toBe(10_000);
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("IN_CUSTODY");
    expect(order.buyerPaymentRef).toBeNull();
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
