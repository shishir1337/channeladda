import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { templateFor } from "@/lib/deal-templates";
import {
  advanceStep,
  balanceOf,
  createDeal,
  expireStaleDeals,
  recordOpeningPayment,
  resolveDeal,
} from "@/server/deals";
import { seedListing, seedUser, withCleanDb } from "@/test/db";

type Mode = "SAFEST" | "FASTEST";

async function open(mode: Mode, priceUsd?: number) {
  const seeded = await seedListing({ priceUsd });
  const created = await createDeal({
    listingId: seeded.listing.id,
    buyerId: seeded.buyer.id,
    mode,
  });
  if (!created.ok) throw new Error(created.reason);
  const staff = await seedUser("MODERATOR");
  await db.order.update({
    where: { id: created.orderId },
    data: { agentId: seeded.agent.id },
  });
  return { ...seeded, orderId: created.orderId, staff, reference: created.reference };
}

async function runTo(mode: Mode, stopBefore: number, priceUsd?: number) {
  const o = await open(mode, priceUsd);
  await recordOpeningPayment(o.orderId, o.reference, "USDT");
  const actors: Record<string, string> = {
    buyer: o.buyer.id,
    seller: o.seller.id,
    agent: o.agent.id,
  };
  for (const step of templateFor(mode)) {
    if (step.position < 2 || step.position >= stopBefore) continue;
    const r = await advanceStep({
      orderId: o.orderId,
      position: step.position,
      userId: actors[step.actor],
      ...(mode === "SAFEST" && step.position === 6
        ? { paymentRef: "0xabc" }
        : {}),
    });
    if (!r.ok) throw new Error(`step ${step.position}: ${r.reason}`);
  }
  return { ...o, actors };
}

// --------------------------------- completing is not a shortcut past the work

test(
  "an agent cannot close a live deal as completed",
  withCleanDb(async () => {
    // The happy path reaches COMPLETED through the final step, which checks
    // the template, the actor and — above the second-approval threshold — a
    // second staff member. resolveDeal checked none of that, and the same
    // transition is legal for an agent, so one call closed a Safest deal with
    // the agent still holding the channel the buyer had already paid for.
    const o = await runTo("SAFEST", 8);

    const result = await resolveDeal({
      orderId: o.orderId,
      to: "COMPLETED",
      byUserId: o.agent.id,
      note: "done",
    });

    expect(result).toMatchObject({ ok: false });
    const order = await db.order.findUniqueOrThrow({
      where: { id: o.orderId },
    });
    expect(order.status).toBe("AWAITING_HANDOVER");
  }),
);

test(
  "staff can still complete a deal they have disputed",
  withCleanDb(async () => {
    // The power resolveDeal exists for is intact: a moderator adjudicating a
    // dispute can finish the deal in the seller's favour.
    const o = await runTo("FASTEST", 5);
    await resolveDeal({
      orderId: o.orderId,
      to: "DISPUTED",
      byUserId: o.buyer.id,
      note: "stalled",
    });

    const result = await resolveDeal({
      orderId: o.orderId,
      to: "COMPLETED",
      byUserId: o.staff.id,
      note: "seller performed",
    });

    expect(result).toMatchObject({ ok: true });
    expect(await balanceOf(o.seller.id)).toBe(10_000);
  }),
);

// ------------------------------- the seller cannot take back a channel paid for

test(
  "a channel is not handed back once the buyer has paid for it",
  withCleanDb(async () => {
    // The guard read sellerConfirmedAt — the seller's own say-so. So a seller
    // who had been paid simply never pressed "I received it", raised a
    // dispute, and a moderator handed the channel back: the seller kept the
    // money and the asset. buyerPaidAt is the buyer's recorded payment, with
    // its transaction reference, and it is what the guard must read.
    const o = await runTo("SAFEST", 7);
    const mid = await db.order.findUniqueOrThrow({
      where: { id: o.orderId },
    });
    expect(mid.buyerPaidAt).not.toBeNull();
    expect(mid.sellerConfirmedAt).toBeNull();

    const result = await resolveDeal({
      orderId: o.orderId,
      to: "RETURNED_TO_SELLER",
      byUserId: o.staff.id,
      note: "seller says no payment",
    });

    expect(result).toMatchObject({ ok: false, reason: "already-paid" });
  }),
);

test(
  "a fastest deal is not refunded once the buyer holds the channel",
  withCleanDb(async () => {
    // The mirror image, and it had no guard at all. The buyer confirms they
    // own the channel, then disputes: a full refund left them with the
    // channel and every cent, and the seller with neither.
    const o = await runTo("FASTEST", 6);
    const mid = await db.order.findUniqueOrThrow({
      where: { id: o.orderId },
    });
    expect(mid.handoverAt).not.toBeNull();

    const result = await resolveDeal({
      orderId: o.orderId,
      to: "REFUNDED",
      byUserId: o.staff.id,
      note: "buyer asked",
    });

    expect(result).toMatchObject({ ok: false, reason: "already-handed-over" });
    expect(await balanceOf(o.buyer.id)).toBe(0);
  }),
);

// ------------------------------- a listing cannot be locked away for nothing

test(
  "an unpaid deal disputed into limbo still frees the listing",
  withCleanDb(async () => {
    // Opening a deal is free and anyone may dispute one, so two calls took a
    // listing off the market for ever: the sweep only looked at
    // AWAITING_PAYMENT, and from DISPUTED there was no outcome staff could
    // reach without a payment reference. Repeat per listing for the catalogue.
    const o = await open("FASTEST");
    await resolveDeal({
      orderId: o.orderId,
      to: "DISPUTED",
      byUserId: o.buyer.id,
      note: "x",
    });
    await db.order.update({
      where: { id: o.orderId },
      data: { createdAt: new Date(Date.now() - 49 * 60 * 60 * 1000) },
    });

    expect(await expireStaleDeals()).toBe(1);

    const listing = await db.listing.findUniqueOrThrow({
      where: { id: o.listing.id },
    });
    expect(listing.status).toBe("LIVE");
  }),
);

test(
  "staff can cancel an unpaid dispute without waiting for the sweep",
  withCleanDb(async () => {
    const o = await open("SAFEST");
    await resolveDeal({
      orderId: o.orderId,
      to: "DISPUTED",
      byUserId: o.buyer.id,
      note: "x",
    });

    const result = await resolveDeal({
      orderId: o.orderId,
      to: "CANCELLED",
      byUserId: o.staff.id,
      note: "nobody paid",
    });

    expect(result).toMatchObject({ ok: true });
    const listing = await db.listing.findUniqueOrThrow({
      where: { id: o.listing.id },
    });
    expect(listing.status).toBe("LIVE");
  }),
);
