import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { templateFor } from "@/lib/deal-templates";
import {
  advanceStep,
  balanceOf,
  createDeal,
  expireStaleDeals,
  platformPositionFor,
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
  const finance = await seedUser("FINANCE");
  await db.order.update({
    where: { id: created.orderId },
    data: { agentId: seeded.agent.id },
  });
  return {
    ...seeded,
    orderId: created.orderId,
    staff,
    finance,
    reference: created.reference,
  };
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
      byUserId: o.finance.id,
      note: "seller performed",
    });

    expect(result).toMatchObject({ ok: true });
    expect(await balanceOf(o.seller.id)).toBe(10_000);
  }),
);

// ------------------------------- the seller cannot take back a channel paid for

test(
  "handing a channel back is not a one-click action once a payment is claimed",
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

    expect(result).toMatchObject({ ok: false, reason: "needs-dispute" });
  }),
);

test(
  "refunding after a handover is not a one-click action",
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
      byUserId: o.finance.id,
      note: "buyer asked",
    });

    expect(result).toMatchObject({ ok: false, reason: "needs-dispute" });
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

// ------------------------------------- a guard must not become a dead end

test(
  "a disputed fastest deal can still be refunded after handover",
  withCleanDb(async () => {
    // The guard against refunding a buyer who already holds the channel fired
    // on AWAITING_RELEASE — which is the only state a Fastest refund is
    // reachable from, and it always carries handoverAt, because the same
    // write sets both. So "refund the buyer" was dead code: a buyer whose
    // seller recovered the channel after handover had no route to their
    // money, and the remaining outcomes either paid the seller in full or
    // refunded the fee alone.
    const o = await runTo("FASTEST", 6);
    const mid = await db.order.findUniqueOrThrow({ where: { id: o.orderId } });
    expect(mid.handoverAt).not.toBeNull();

    await resolveDeal({
      orderId: o.orderId,
      to: "DISPUTED",
      byUserId: o.buyer.id,
      note: "seller took it back",
    });

    const result = await resolveDeal({
      orderId: o.orderId,
      to: "REFUNDED",
      byUserId: o.finance.id,
      note: "seller recovered the channel through Google",
    });

    expect(result).toMatchObject({ ok: true });
    expect(await balanceOf(o.buyer.id)).toBe(10_300);
  }),
);

test(
  "refunding a handed-over deal still needs a dispute, not one click",
  withCleanDb(async () => {
    // The protection that guard was reaching for: a single staff member must
    // not be able to reverse a completed handover straight from the live
    // state. It is an adjudication, so it goes through a dispute and leaves
    // a record.
    const o = await runTo("FASTEST", 6);

    const result = await resolveDeal({
      orderId: o.orderId,
      to: "REFUNDED",
      byUserId: o.finance.id,
      note: "buyer asked",
    });

    expect(result).toMatchObject({ ok: false, reason: "needs-dispute" });
    expect(await balanceOf(o.buyer.id)).toBe(0);
  }),
);

test(
  "a seller's channel can be returned when the buyer only claims to have paid",
  withCleanDb(async () => {
    // buyerPaidAt is stamped by the buyer completing a step whose payment
    // reference is free text nobody validates. Treating it as proof let a
    // buyer type "0x0", pay nothing, and strand the seller's channel with the
    // agent for ever: returning it was refused, and the only other ending
    // refunded nothing and meant something else.
    const o = await runTo("SAFEST", 7);
    const mid = await db.order.findUniqueOrThrow({ where: { id: o.orderId } });
    expect(mid.buyerPaidAt).not.toBeNull();
    expect(mid.sellerConfirmedAt).toBeNull();

    await resolveDeal({
      orderId: o.orderId,
      to: "DISPUTED",
      byUserId: o.seller.id,
      note: "no payment arrived",
    });

    const result = await resolveDeal({
      orderId: o.orderId,
      to: "RETURNED_TO_SELLER",
      byUserId: o.staff.id,
      note: "checked the chain, nothing was sent",
    });

    expect(result).toMatchObject({ ok: true });
  }),
);

test(
  "a channel is never handed back once the seller says they were paid",
  withCleanDb(async () => {
    // The seller's own admission is the one signal that cannot be gamed by
    // the party it would favour, so it stays an outright refusal.
    const o = await runTo("SAFEST", 8);
    const mid = await db.order.findUniqueOrThrow({ where: { id: o.orderId } });
    expect(mid.sellerConfirmedAt).not.toBeNull();

    await resolveDeal({
      orderId: o.orderId,
      to: "DISPUTED",
      byUserId: o.seller.id,
      note: "changed my mind",
    });

    expect(
      await resolveDeal({
        orderId: o.orderId,
        to: "RETURNED_TO_SELLER",
        byUserId: o.staff.id,
        note: "seller asked",
      }),
    ).toMatchObject({ ok: false, reason: "already-paid" });
  }),
);

// --------------------------------- moving money is finance's, not everyone's

test(
  "a moderator cannot pay the seller out of escrow",
  withCleanDb(async () => {
    // The product draws a careful line around money: /admin/payouts is
    // FINANCE-only, the nav hides the whole Money group from moderators, and
    // the overview will not show them a payout figure. The deal desk walked
    // around all of it — every staff role collapses to one "staff" actor, so
    // a moderator could raise a dispute on a $10,000 deal and then decide it
    // in the seller's favour, landing the whole escrow in a wallet with no
    // finance involvement and no second approval.
    const o = await runTo("FASTEST", 5);
    const moderator = await seedUser("MODERATOR");

    await resolveDeal({
      orderId: o.orderId,
      to: "DISPUTED",
      byUserId: moderator.id,
      note: "looking at this",
    });

    expect(
      await resolveDeal({
        orderId: o.orderId,
        to: "COMPLETED",
        byUserId: moderator.id,
        note: "seller performed",
      }),
    ).toMatchObject({ ok: false, reason: "needs-finance" });

    expect(await balanceOf(o.seller.id)).toBe(0);
  }),
);

test(
  "nor refund the buyer out of it",
  withCleanDb(async () => {
    const o = await runTo("FASTEST", 5);
    const moderator = await seedUser("MODERATOR");
    await resolveDeal({
      orderId: o.orderId,
      to: "DISPUTED",
      byUserId: moderator.id,
      note: "looking at this",
    });

    expect(
      await resolveDeal({
        orderId: o.orderId,
        to: "REFUNDED",
        byUserId: moderator.id,
        note: "buyer is right",
      }),
    ).toMatchObject({ ok: false, reason: "needs-finance" });

    expect(await balanceOf(o.buyer.id)).toBe(0);
  }),
);

test(
  "finance can, and so can a superadmin",
  withCleanDb(async () => {
    const o = await runTo("FASTEST", 5);
    const finance = await seedUser("FINANCE");
    await resolveDeal({
      orderId: o.orderId,
      to: "DISPUTED",
      byUserId: finance.id,
      note: "looking at this",
    });

    expect(
      await resolveDeal({
        orderId: o.orderId,
        to: "COMPLETED",
        byUserId: finance.id,
        note: "seller performed",
      }),
    ).toMatchObject({ ok: true });
    expect(await balanceOf(o.seller.id)).toBe(10_000);
  }),
);

test(
  "a moderator can still do everything that moves no platform money",
  withCleanDb(async () => {
    // The adjudication itself is theirs. Pausing a deal, cancelling an unpaid
    // one, handing a channel back — none of those pay anybody out of escrow.
    const o = await open("SAFEST");
    const moderator = await seedUser("MODERATOR");

    expect(
      await resolveDeal({
        orderId: o.orderId,
        to: "DISPUTED",
        byUserId: moderator.id,
        note: "seller is unresponsive",
      }),
    ).toMatchObject({ ok: true });

    expect(
      await resolveDeal({
        orderId: o.orderId,
        to: "CANCELLED",
        byUserId: moderator.id,
        note: "nobody paid",
      }),
    ).toMatchObject({ ok: true });
  }),
);

// ------------------------------- cancelling must not keep anybody's money

test(
  "cancelling a paid fastest deal gives the buyer everything back",
  withCleanDb(async () => {
    // The fee-only refund was guarded on `!order.custodyAt` — and custodyAt is
    // stamped on Safest step 4 and nowhere else, so on every paid Fastest deal
    // the condition held and the refund was the admin fee. The platform kept
    // the channel price, the order went terminal, and the only REFUND writes
    // in the codebase live in resolveDeal — so no path remained that could
    // ever return it.
    const o = await runTo("FASTEST", 3);
    expect(await platformPositionFor(o.orderId)).toBe(10_300);

    await resolveDeal({
      orderId: o.orderId,
      to: "DISPUTED",
      byUserId: o.buyer.id,
      note: "seller went quiet",
    });
    const result = await resolveDeal({
      orderId: o.orderId,
      to: "CANCELLED",
      byUserId: o.finance.id,
      note: "neither side can continue",
    });

    expect(result).toMatchObject({ ok: true });
    expect(await balanceOf(o.buyer.id)).toBe(10_300);
    // Nothing of the buyer's is left on our books.
    expect(await platformPositionFor(o.orderId)).toBe(0);
  }),
);

test(
  "cancelling an unpaid deal still refunds nothing, and goes negative never",
  withCleanDb(async () => {
    const o = await open("FASTEST");
    await resolveDeal({
      orderId: o.orderId,
      to: "DISPUTED",
      byUserId: o.buyer.id,
      note: "changed my mind",
    });

    expect(
      await resolveDeal({
        orderId: o.orderId,
        to: "CANCELLED",
        byUserId: o.staff.id,
        note: "nobody paid",
      }),
    ).toMatchObject({ ok: true });

    expect(await balanceOf(o.buyer.id)).toBe(0);
    expect(await platformPositionFor(o.orderId)).toBe(0);
  }),
);

test(
  "a safest deal in custody cannot be cancelled, only returned",
  withCleanDb(async () => {
    // Cancelling set the listing back to LIVE and closed the order — while a
    // staff agent still personally owned the seller's Google channel, with
    // RETURNED_TO_SELLER no longer reachable. The seller's channel sat in a
    // staff member's account and the same channel went back on sale.
    const o = await runTo("SAFEST", 5);
    const mid = await db.order.findUniqueOrThrow({ where: { id: o.orderId } });
    expect(mid.custodyAt).not.toBeNull();

    await resolveDeal({
      orderId: o.orderId,
      to: "DISPUTED",
      byUserId: o.buyer.id,
      note: "stuck",
    });

    expect(
      await resolveDeal({
        orderId: o.orderId,
        to: "CANCELLED",
        byUserId: o.staff.id,
        note: "calling it off",
      }),
    ).toMatchObject({ ok: false, reason: "in-custody" });

    // The right ending is still available.
    expect(
      await resolveDeal({
        orderId: o.orderId,
        to: "RETURNED_TO_SELLER",
        byUserId: o.staff.id,
        note: "giving the channel back",
      }),
    ).toMatchObject({ ok: true });
  }),
);
