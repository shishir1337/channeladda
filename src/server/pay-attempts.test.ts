import { beforeEach, expect, test, vi } from "vitest";
import { signPayload } from "@/lib/cryptomus-sign";
import { db } from "@/lib/db";
import { createDeal } from "@/server/deals";
import { seedListing, withCleanDb } from "@/test/db";

// Cryptomus as observed against the live API on 2026-10-17: asking for an
// invoice under an order_id it has already seen returns that same invoice —
// still open within its hour, and the same cancelled, final invoice after
// it. Only the processor is replaced; the action, the webhook route, the
// sweep and the database are real.
const fake = vi.hoisted(() => ({
  buyerId: "",
  invoices: new Map<
    string,
    { uuid: string; amountUsd: number; status: string; isFinal: boolean }
  >(),
  created: [] as string[],
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
  }) => ({
    status: row.status,
    isFinal: row.isFinal,
    paidAmountUsd: row.status === "paid" ? row.amountUsd : null,
    payerCurrency: row.status === "paid" ? "USDT" : null,
  });
  return {
    ...real,
    isConfigured: () => true,
    cryptomusConfig: () => ({
      merchantId: "test-merchant",
      paymentKey: "test-payment-key",
    }),
    createInvoice: async (request: { orderId: string; amountUsd: number }) => {
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

function settle(orderId: string, status: string, isFinal: boolean) {
  const row = fake.invoices.get(orderId);
  if (!row) throw new Error(`no invoice ${orderId}`);
  row.status = status;
  row.isFinal = isFinal;
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
