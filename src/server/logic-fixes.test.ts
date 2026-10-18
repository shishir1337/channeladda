import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { templateFor } from "@/lib/deal-templates";
import {
  advanceStep,
  assignAgent,
  balanceOf,
  createDeal,
  recordOpeningPayment,
  resolveDeal,
} from "@/server/deals";
import { counterOffer, createOffer, withdrawOffer } from "@/server/offers";
import { creditDeposit, payFromWallet } from "@/server/wallet";
import { seedListing, seedUser, withCleanDb } from "@/test/db";
import { runStep } from "@/test/deal-steps";

/**
 * Findings from the business-logic review: rules that did exactly what the
 * code said, where what the code said was wrong.
 */

type Mode = "SAFEST" | "FASTEST";

async function open(mode: Mode) {
  const seeded = await seedListing();
  const created = await createDeal({
    listingId: seeded.listing.id,
    buyerId: seeded.buyer.id,
    mode,
  });
  if (!created.ok) throw new Error(created.reason);
  await db.order.update({
    where: { id: created.orderId },
    data: { agentId: seeded.agent.id },
  });
  const finance = await seedUser("FINANCE");
  return { ...seeded, ...created, finance };
}

async function runTo(mode: Mode, stopBefore: number) {
  const o = await open(mode);
  await recordOpeningPayment(o.orderId, o.reference, "USDT");
  const actors: Record<string, string> = {
    buyer: o.buyer.id,
    seller: o.seller.id,
    agent: o.agent.id,
  };
  for (const step of templateFor(mode)) {
    if (step.position < 2 || step.position >= stopBefore) continue;
    const r = await runStep({
      orderId: o.orderId,
      position: step.position,
      userId: actors[step.actor],
    });
    if (!r.ok) throw new Error(`step ${step.position}: ${r.reason}`);
  }
  return { ...o, actors };
}

// ------------------------------------------------- the hold that was promised

test(
  "a fastest seller is not paid the moment the buyer confirms",
  withCleanDb(async () => {
    // Every listing page promises "the 14-day hold on this platform covers the
    // window in which an old owner could try to recover the account".
    // Order.holdUntil — "set from the platform's own recovery window when the
    // buyer confirms" — was written by nothing and read by nothing, and the
    // seller's balance was credited and withdrawable the same minute.
    const o = await runTo("FASTEST", 6);

    const order = await db.order.findUniqueOrThrow({
      where: { id: o.orderId },
    });
    expect(order.holdUntil?.getTime()).toBeGreaterThan(Date.now());

    expect(
      await advanceStep({
        orderId: o.orderId,
        position: 6,
        userId: o.agent.id,
      }),
    ).toMatchObject({ ok: false, reason: "on-hold" });
    expect(await balanceOf(o.seller.id)).toBe(0);
  }),
);

test(
  "once the hold has passed, the seller is released as before",
  withCleanDb(async () => {
    const o = await runTo("FASTEST", 6);
    await db.order.update({
      where: { id: o.orderId },
      data: { holdUntil: new Date(Date.now() - 1000) },
    });

    expect(
      await advanceStep({
        orderId: o.orderId,
        position: 6,
        userId: o.agent.id,
      }),
    ).toMatchObject({ ok: true });
    expect(await balanceOf(o.seller.id)).toBe(10_000);
  }),
);

// ------------------------ the seller's irreversible act counts for something

test(
  "a fastest refund after the seller handed the channel over needs a dispute",
  withCleanDb(async () => {
    // Step 4 is the seller promoting the buyer to owner — the seller's
    // irreversible act — and it stamped nothing. The guard looked only at
    // handoverAt, set by the buyer at step 5. So a buyer who held the channel
    // and simply never pressed step 5 could be refunded in full with one
    // staff click, and keep the channel.
    const o = await runTo("FASTEST", 5);

    expect(
      await resolveDeal({
        orderId: o.orderId,
        to: "REFUNDED",
        byUserId: o.finance.id,
        note: "buyer asked",
      }),
    ).toMatchObject({ ok: false, reason: "needs-dispute" });
    expect(await balanceOf(o.buyer.id)).toBe(0);
  }),
);

test(
  "before the seller has acted, a fastest refund is still one decision",
  withCleanDb(async () => {
    const o = await runTo("FASTEST", 4);

    expect(
      await resolveDeal({
        orderId: o.orderId,
        to: "REFUNDED",
        byUserId: o.finance.id,
        note: "seller never showed",
      }),
    ).toMatchObject({ ok: true });
    expect(await balanceOf(o.buyer.id)).toBe(10_300);
  }),
);

// ------------------------------------------- a dispute does not hide a hold

test(
  "a disputed deal still counts against its agent's cap",
  withCleanDb(async () => {
    // AGENT_HOLDS did not include DISPUTED, and a buyer can dispute for free.
    // So an agent at their cap of channels in custody could be handed as many
    // again the moment those buyers disputed, while still owning the first
    // lot — defeating both reasons the cap exists.
    const seeded = await seedListing({ settings: { maxHoldsPerAgent: 1 } });
    const created = await createDeal({
      listingId: seeded.listing.id,
      buyerId: seeded.buyer.id,
      mode: "SAFEST",
    });
    if (!created.ok) throw new Error(created.reason);
    await db.order.update({
      where: { id: created.orderId },
      data: {
        agentId: seeded.agent.id,
        status: "DISPUTED",
        custodyAt: new Date(),
        paymentRef: created.reference,
      },
    });

    const second = await seedListing({ settings: { maxHoldsPerAgent: 1 } });
    const next = await createDeal({
      listingId: second.listing.id,
      buyerId: second.buyer.id,
      mode: "SAFEST",
    });
    if (!next.ok) throw new Error(next.reason);
    const admin = await seedUser("SUPERADMIN");

    expect(
      await assignAgent({
        orderId: next.orderId,
        agentId: seeded.agent.id,
        byUserId: admin.id,
        agentEmail: "agent@channeladda.test",
        agentBrand: "Channel Adda",
      }),
    ).toMatchObject({ ok: false, reason: "cap-reached" });
  }),
);

// ---------------------------------------- paying from a balance, after expiry

test(
  "paying from a balance cannot revive an order that has expired",
  withCleanDb(async () => {
    // recordOpeningPayment keys its compare-and-set on the status as well as
    // the reference; payFromWallet keyed it on the reference alone. An order
    // the sweep expired mid-payment was written back to AGENT_VERIFYING with
    // its listing already sold to somebody else — two live deals, one channel.
    const o = await open("FASTEST");
    await creditDeposit(o.buyer.id, 20_000, "dep-revive", "USDT");
    await db.order.update({
      where: { id: o.orderId },
      data: { status: "PAYMENT_EXPIRED" },
    });

    const result = await payFromWallet(o.buyer.id, o.orderId);
    expect(result).toMatchObject({ ok: false });

    const order = await db.order.findUniqueOrThrow({
      where: { id: o.orderId },
    });
    expect(order.status).toBe("PAYMENT_EXPIRED");
    expect(await balanceOf(o.buyer.id)).toBe(20_000);
  }),
);

// ------------------------------------------- the payment reference is required

// ---------------------------------------- whose offer is it to withdraw

test(
  "a buyer cannot quietly withdraw the seller's counter-offer",
  withCleanDb(async () => {
    // A seller's counter is stored under the buyer's id, so withdrawOffer —
    // scoped on buyerId alone — matched it. The seller's counter vanished
    // with no notification, recorded as though the buyer had retracted their
    // own offer.
    const seeded = await seedListing({ priceUsd: 10_000 });
    const made = await createOffer({
      buyerId: seeded.buyer.id,
      listingId: seeded.listing.id,
      amountCents: 7_000,
      message: null,
      expiryHours: 48,
    });
    if (!made.ok) throw new Error(made.reason);
    const countered = await counterOffer({
      offerId: made.value.offerId,
      responderId: seeded.seller.id,
      as: "seller",
      amountCents: 9_000,
      message: null,
      expiryHours: 48,
    });
    if (!countered.ok) throw new Error(countered.reason);

    expect(
      await withdrawOffer(countered.value.offerId, seeded.buyer.id),
    ).toMatchObject({
      ok: false,
    });
    const counter = await db.offer.findUniqueOrThrow({
      where: { id: countered.value.offerId },
    });
    expect(counter.status).toBe("OPEN");
  }),
);

// ------------------------------------------- what a buyer has actually spent

test(
  "a completed safest purchase counts the price the buyer paid the seller",
  withCleanDb(async () => {
    // totalUsd on a Safest deal is only our fee, so a buyer who completed a
    // $100 purchase was shown "Spent on purchases: $3" while the seller's
    // mirror tile read $100 for the same deal.
    const { getBuyerSummary } = await import("@/server/dashboard");
    const o = await open("SAFEST");
    await db.order.update({
      where: { id: o.orderId },
      data: { status: "COMPLETED", paymentRef: o.reference },
    });

    const summary = await getBuyerSummary(o.buyer.id);
    expect(summary.bought).toBe(1);
    // $100 to the seller and $3 to us.
    expect(summary.spent).toBe(103);
  }),
);
