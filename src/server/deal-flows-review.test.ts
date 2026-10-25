import { expect, test } from "vitest";
import type { DealMode } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { templateFor } from "@/lib/deal-templates";
import { handoverAction } from "@/server/deal-notify";
import {
  advanceStep,
  balanceOf,
  createDeal,
  platformPositionFor,
  recordOpeningPayment,
  recordStrayPricePayment,
  resolveDeal,
} from "@/server/deals";
import { seedListing, seedUser, withCleanDb } from "@/test/db";
import { runStep } from "@/test/deal-steps";

// Found by the review of the client's flows of 2026-10-20: what a deal opened
// before the change, or a payment made under it, can still do afterwards.

const OLD_SAFEST = [
  "Pay the admin fee",
  "Invite the agent as channel owner",
  "Accept and confirm custody",
  "Hold 1 complete, ownership verified",
  "Inspect the channel",
  "Pay the price to Channel Adda",
  "Transfer ownership to the buyer",
  "Hold 2 complete, ownership verified",
];
const OLD_FASTEST = [
  "Pay the full amount",
  "Invite the agent as manager",
  "Verify the channel matches the listing",
  "Promote the buyer to primary owner",
  "Confirm access received",
  "Release the seller's funds",
];

async function paid(mode: DealMode) {
  const seeded = await seedListing();
  const created = await createDeal({
    listingId: seeded.listing.id,
    buyerId: seeded.buyer.id,
    mode,
    acceptedRevenueRisk: true,
  });
  if (!created.ok) throw new Error(created.reason);
  await db.order.update({
    where: { id: created.orderId },
    data: { agentId: seeded.agent.id },
  });
  await recordOpeningPayment(created.orderId, `pay-${created.orderId}`, "USDT");
  const finance = await seedUser("FINANCE");
  return { ...seeded, orderId: created.orderId, finance };
}

/** Rewrites a deal's seeded steps as the earlier template had them. */
async function onOldSteps(orderId: string, labels: string[], done: number) {
  await db.transferStep.deleteMany({ where: { orderId } });
  await db.transferStep.createMany({
    data: labels.map((label, index) => ({
      orderId,
      position: index + 1,
      label,
      actor: "buyer",
      completedAt: index + 1 <= done ? new Date() : null,
    })),
  });
}

async function walk(
  orderId: string,
  mode: DealMode,
  actors: Record<string, string>,
  stopBefore: number,
) {
  for (const step of templateFor(mode)) {
    if (step.position < 2 || step.position >= stopBefore) continue;
    const r = await runStep({
      orderId,
      position: step.position,
      userId: actors[step.actor],
    });
    if (!r.ok) throw new Error(`step ${step.position}: ${r.reason}`);
  }
}

test(
  "a price invoice already applied under the old flow is not credited again",
  withCleanDb(async () => {
    const { orderId, buyer } = await paid("SAFEST");
    await db.invoice.create({
      data: {
        reference: "DEAL-price",
        purpose: "DEAL_PRICE",
        amountUsd: 10_000,
        userId: buyer.id,
        orderId,
        settledAt: new Date(),
      },
    });
    // Applied before the change: the price is on the deal, held.
    await db.order.update({
      where: { id: orderId },
      data: { buyerPaymentRef: "DEAL-price", buyerPaidAt: new Date() },
    });

    expect(await recordStrayPricePayment(orderId, "DEAL-price", "USDT")).toBe(
      "already-applied",
    );
    expect(await balanceOf(buyer.id)).toBe(0);
  }),
);

test(
  "an old Safest deal waiting on its price cannot be marked paid by the new step",
  withCleanDb(async () => {
    const { orderId, buyer } = await paid("SAFEST");
    await onOldSteps(orderId, OLD_SAFEST, 5);
    await db.order.update({
      where: { id: orderId },
      data: { status: "AWAITING_BUYER_PAYMENT", custodyAt: new Date() },
    });

    expect(
      await advanceStep({ orderId, position: 6, userId: buyer.id }),
    ).toEqual({ ok: false, reason: "old-steps" });
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.buyerPaidAt).toBeNull();
  }),
);

test(
  "an old Fastest deal cannot skip the holding period it never started",
  withCleanDb(async () => {
    const { orderId, seller } = await paid("FASTEST");
    await onOldSteps(orderId, OLD_FASTEST, 3);
    await db.order.update({
      where: { id: orderId },
      data: { status: "AWAITING_HANDOVER" },
    });

    expect(
      await advanceStep({ orderId, position: 4, userId: seller.id }),
    ).toEqual({ ok: false, reason: "old-steps" });
  }),
);

test(
  "an old Safest deal whose price we hold can still be returned, and the price goes back",
  withCleanDb(async () => {
    const { orderId, buyer, finance } = await paid("SAFEST");
    await onOldSteps(orderId, OLD_SAFEST, 6);
    await db.ledgerEntry.create({
      data: {
        orderId,
        userId: null,
        kind: "ESCROW_HOLD",
        amountUsd: 10_000,
        note: "SAFEST price payment",
      },
    });
    await db.order.update({
      where: { id: orderId },
      data: {
        status: "AWAITING_HANDOVER",
        custodyAt: new Date(),
        buyerPaidAt: new Date(),
        buyerPaymentRef: "DEAL-price",
      },
    });

    await resolveDeal({
      orderId,
      to: "DISPUTED",
      byUserId: buyer.id,
      note: "the transfer never came",
    });
    expect(
      await resolveDeal({
        orderId,
        to: "RETURNED_TO_SELLER",
        byUserId: finance.id,
        note: "returned",
      }),
    ).toMatchObject({ ok: true });
    expect(await balanceOf(buyer.id)).toBe(10_000);
    expect(await platformPositionFor(orderId)).toBe(300);
  }),
);

test(
  "a Fastest refund once our agent has invited the buyer needs a dispute",
  withCleanDb(async () => {
    // The buyer has had access to the channel; giving the money back on one
    // click would reverse what both sides did without hearing the seller.
    const { orderId, buyer, seller, agent, finance } = await paid("FASTEST");
    await walk(
      orderId,
      "FASTEST",
      { buyer: buyer.id, seller: seller.id, agent: agent.id },
      4,
    );
    expect(
      await resolveDeal({
        orderId,
        to: "REFUNDED",
        byUserId: finance.id,
        note: "buyer asked",
      }),
    ).toMatchObject({ ok: false, reason: "needs-dispute" });
  }),
);

test(
  "a Fastest dispute cannot pay the seller before our agent is primary owner",
  withCleanDb(async () => {
    // The seller would be paid and still own the channel.
    const { orderId, buyer, seller, agent, finance } = await paid("FASTEST");
    await walk(
      orderId,
      "FASTEST",
      { buyer: buyer.id, seller: seller.id, agent: agent.id },
      4,
    );
    await resolveDeal({
      orderId,
      to: "DISPUTED",
      byUserId: seller.id,
      note: "the buyer will not answer",
    });
    expect(
      await resolveDeal({
        orderId,
        to: "COMPLETED",
        byUserId: finance.id,
        note: "for the seller",
      }),
    ).toMatchObject({ ok: false, reason: "not-handed-over" });
    expect(await balanceOf(seller.id)).toBe(0);
  }),
);

test("each step that uses the buyer's account says what to do with it", () => {
  // "Give ownership to this account" at the step that only invites the
  // buyer would have read as handing the channel over before the holding
  // period. Both steps are our agent's.
  expect(handoverAction("FASTEST", 3)).toBe("Invite this account as an owner");
  expect(handoverAction("FASTEST", 6)).toBe(
    "Make this account the primary owner",
  );
  // Safest the same since 2026-10-25: an owner invite, then primary owner.
  expect(handoverAction("SAFEST", 8)).toBe("Invite this account as an owner");
  expect(handoverAction("SAFEST", 9)).toBe(
    "Make this account the primary owner",
  );
  // Steps that do not touch it — every one of the seller's among them —
  // are not sent it.
  for (const position of [2, 4, 5]) {
    expect(handoverAction("FASTEST", position)).toBeNull();
  }
  for (const position of [2, 3, 4, 5, 6, 7]) {
    expect(handoverAction("SAFEST", position)).toBeNull();
  }
});
