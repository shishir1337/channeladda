import { expect, test, vi } from "vitest";
import { db } from "@/lib/db";
import { threadHref } from "@/lib/thread-href";
import { createDeal } from "@/server/deals";
import { seedListing, withCleanDb } from "@/test/db";

/**
 * Where Cryptomus sends a buyer back to after paying: the conversation.
 *
 * It cannot depend on which page the buyer paid from — pressing Pay again
 * reuses the invoice still open, and Cryptomus keeps the first request's
 * return address — so it is always the place the deal now runs from.
 */

const fake = vi.hoisted(() => ({
  buyerId: "",
  requests: [] as { orderId: string; successUrl: string; returnUrl: string }[],
}));

vi.mock("@/server/session", () => ({
  requireUser: async () => ({ id: fake.buyerId, role: "USER" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/cryptomus", async (original) => {
  const real = await original<typeof import("@/server/cryptomus")>();
  return {
    ...real,
    isConfigured: () => true,
    cryptomusConfig: () => ({
      merchantId: "test-merchant",
      paymentKey: "test-payment-key",
    }),
    createInvoice: async (request: {
      orderId: string;
      successUrl: string;
      returnUrl: string;
    }) => {
      fake.requests.push(request);
      return {
        uuid: `uuid-${fake.requests.length}`,
        url: `https://pay.example.test/${fake.requests.length}`,
        orderId: request.orderId,
        status: "check",
        isFinal: false,
        expiresAt: null,
      };
    },
  };
});

const { startPayment } = await import("@/server/actions/payments");

test(
  "crypto checkout returns the buyer to the conversation",
  withCleanDb(async () => {
    const { listing, buyer } = await seedListing();
    const created = await createDeal({
      listingId: listing.id,
      buyerId: buyer.id,
      mode: "FASTEST",
      acceptedRevenueRisk: true,
    });
    if (!created.ok) throw new Error(created.reason);
    fake.buyerId = buyer.id;
    const order = await db.order.findUniqueOrThrow({
      where: { id: created.orderId },
    });

    const paid = await startPayment(created.orderId);
    expect(paid.ok).toBe(true);

    const [request] = fake.requests;
    const back = threadHref(order.conversationId ?? "", order.listingId);
    expect(request.successUrl.endsWith(back)).toBe(true);
    expect(request.returnUrl.endsWith(back)).toBe(true);
  }),
);
