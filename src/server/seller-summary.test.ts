import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { templateFor } from "@/lib/deal-templates";
import { getSellerSummary } from "@/server/dashboard";
import { createDeal, recordOpeningPayment } from "@/server/deals";
import { seedListing, withCleanDb } from "@/test/db";
import { runStep } from "@/test/deal-steps";

// The client (2026-10-25): a sale "is showing in earnings but not added in
// wallet". One "Earned from sales" figure counted Safest sales — the buyer
// pays the seller directly, so they never come through the wallet — with the
// Fastest sales that do. The dashboard shows the two apart now.

/** A deal on one of this seller's listings, run up to step `through`. */
async function sale(mode: "SAFEST" | "FASTEST", through: number) {
  const seeded = await seedListing();
  const created = await createDeal({
    listingId: seeded.listing.id,
    buyerId: seeded.buyer.id,
    mode,
    acceptedRevenueRisk: true,
    handoverTo: "buyer-channel@example.test",
  });
  if (!created.ok) throw new Error(created.reason);
  const { orderId } = created;
  await db.order.update({
    where: { id: orderId },
    data: {
      agentId: seeded.agent.id,
      agentEmail: "transfers@channeladda.test",
      agentBrand: "Channel Adda Transfers",
    },
  });
  await recordOpeningPayment(orderId, `pay-${orderId}`, "USDT");
  const actors: Record<string, string> = {
    buyer: seeded.buyer.id,
    seller: seeded.seller.id,
    agent: seeded.agent.id,
  };
  for (const step of templateFor(mode)) {
    if (step.position < 2 || step.position > through) continue;
    const done = await runStep({
      orderId,
      position: step.position,
      userId: actors[step.actor],
    });
    if (!done.ok) throw new Error(`step ${step.position}: ${done.reason}`);
  }
  return {
    ...seeded,
    order: await db.order.findUniqueOrThrow({ where: { id: orderId } }),
  };
}

test(
  "a Fastest sale counts as paid into the wallet the moment the seller is paid",
  withCleanDb(async () => {
    // Step 5, our agent confirming primary ownership, pays the seller; the
    // deal itself finishes a step later.
    const { seller, order } = await sale("FASTEST", 5);
    expect(order.status).not.toBe("COMPLETED");

    const summary = await getSellerSummary(seller.id);
    expect(summary.paidToWallet).toBe(
      (order.priceUsd - order.sellerFeeUsd) / 100,
    );
    expect(summary.walletSales).toBe(1);
    expect(summary.paidDirect).toBe(0);
    expect(summary.directSales).toBe(0);
  }),
);

test(
  "a Safest sale counts as paid directly once the seller says the money arrived, never as wallet money",
  withCleanDb(async () => {
    const { seller, order } = await sale("SAFEST", 7);

    const summary = await getSellerSummary(seller.id);
    expect(summary.paidDirect).toBe(order.priceUsd / 100);
    expect(summary.directSales).toBe(1);
    expect(summary.paidToWallet).toBe(0);
    expect(summary.walletSales).toBe(0);
  }),
);

test(
  "nothing counts before the seller has the money",
  withCleanDb(async () => {
    // Safest: the buyer has pressed Paid, the seller not yet Received.
    // Fastest: our agent is an owner, not yet primary owner.
    const safest = await sale("SAFEST", 6);
    const fastest = await sale("FASTEST", 4);
    for (const { seller } of [safest, fastest]) {
      expect(await getSellerSummary(seller.id)).toMatchObject({
        paidToWallet: 0,
        walletSales: 0,
        paidDirect: 0,
        directSales: 0,
      });
    }
  }),
);
