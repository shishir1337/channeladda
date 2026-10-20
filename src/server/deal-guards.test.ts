import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { templateFor } from "@/lib/deal-templates";
import {
  advanceStep,
  balanceOf,
  createDeal,
  platformPositionFor,
  recordOpeningPayment,
  resolveDeal,
} from "@/server/deals";
import { passHold, seedListing, seedUser, withCleanDb } from "@/test/db";
import { runStep } from "@/test/deal-steps";

type Mode = "SAFEST" | "FASTEST";

async function open(mode: Mode, priceUsd?: number) {
  const seeded = await seedListing({ priceUsd });
  const created = await createDeal({
    listingId: seeded.listing.id,
    buyerId: seeded.buyer.id,
    mode,
  });
  if (!created.ok) throw new Error(created.reason);
  const staff = await seedUser("FINANCE") /* money outcomes are finance-only */;
  await db.order.update({
    where: { id: created.orderId },
    data: { agentId: seeded.agent.id },
  });
  return { ...seeded, orderId: created.orderId, staff };
}

async function runTo(mode: Mode, stopBefore: number, priceUsd?: number) {
  const o = await open(mode, priceUsd);
  await recordOpeningPayment(o.orderId, `pay-${o.orderId}`, "USDT");
  const actors: Record<string, string> = {
    buyer: o.buyer.id,
    seller: o.seller.id,
    agent: o.agent.id,
  };
  for (const step of templateFor(mode)) {
    if (step.position < 2 || step.position >= stopBefore) continue;
    await passHold(o.orderId);
    const r = await runStep({
      orderId: o.orderId,
      position: step.position,
      userId: actors[step.actor],
    });
    if (!r.ok) throw new Error(`step ${step.position}: ${r.reason}`);
  }
  return { ...o, actors };
}

// ---------------------------------------------- C1: nothing moves before pay

test(
  "a buyer cannot mark the opening payment done themselves",
  withCleanDb(async () => {
    // The whole protection rests on money arriving before a channel moves. The
    // payment step is completed by recordOpeningPayment and by nothing else.
    const { orderId, buyer } = await open("SAFEST");
    expect(
      await advanceStep({ orderId, position: 1, userId: buyer.id }),
    ).toMatchObject({ ok: false, reason: "not-paid" });

    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.feePaidAt).toBeNull();
    expect(await db.ledgerEntry.count({ where: { orderId } })).toBe(0);
  }),
);

test(
  "no step at all advances while the deal is unpaid",
  withCleanDb(async () => {
    const { orderId, seller, agent } = await open("SAFEST");
    for (const [position, userId] of [
      [2, seller.id],
      [3, agent.id],
    ] as const) {
      expect(await advanceStep({ orderId, position, userId })).toMatchObject({
        ok: false,
        reason: "not-paid",
      });
    }
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.custodyAt).toBeNull();
  }),
);

// ------------------------------------- C2: one step completion, not two

test(
  "two concurrent completions of the release step credit the seller once",
  withCleanDb(async () => {
    const { orderId, actors, seller } = await runTo("FASTEST", 6);

    await passHold(orderId);
    const results = await Promise.all([
      advanceStep({ orderId, position: 6, userId: actors.agent }),
      advanceStep({ orderId, position: 6, userId: actors.agent }),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await balanceOf(seller.id)).toBe(10_000);
    expect(
      await db.ledgerEntry.count({
        where: { orderId, kind: "ESCROW_RELEASE" },
      }),
    ).toBe(2); // one to the seller, one netting the platform's hold
    expect(
      await db.ledgerEntry.count({
        where: { orderId, kind: "ESCROW_RELEASE", userId: seller.id },
      }),
    ).toBe(1);
  }),
);

test(
  "a step cannot be completed twice in sequence either",
  withCleanDb(async () => {
    const { orderId, actors } = await runTo("SAFEST", 3);
    expect(
      await advanceStep({ orderId, position: 3, userId: actors.agent }),
    ).toMatchObject({ ok: true });
    expect(
      await advanceStep({ orderId, position: 3, userId: actors.agent }),
    ).toMatchObject({ ok: false, reason: "wrong-step" });
  }),
);

// ------------------------------- C3: concurrent payment delivery is idempotent

test(
  "two concurrent deliveries of one payment reference write one ledger row",
  withCleanDb(async () => {
    const { orderId } = await open("FASTEST");

    const settled = await Promise.allSettled([
      recordOpeningPayment(orderId, "cryptomus-same", "USDT"),
      recordOpeningPayment(orderId, "cryptomus-same", "USDT"),
    ]);
    expect(settled.some((s) => s.status === "fulfilled")).toBe(true);

    expect(await db.ledgerEntry.count({ where: { orderId } })).toBe(1);
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("AGENT_VERIFYING");
  }),
);

// ------------------------- C4: no refund of money that never arrived

test(
  "an unpaid fastest deal cannot be refunded",
  withCleanDb(async () => {
    const { orderId, buyer, staff } = await open("FASTEST");

    // A dispute is legal before payment; a refund of nothing is not.
    expect(
      await resolveDeal({
        orderId,
        to: "DISPUTED",
        byUserId: buyer.id,
        note: "changed my mind",
      }),
    ).toMatchObject({ ok: true });

    expect(
      await resolveDeal({
        orderId,
        to: "REFUNDED",
        byUserId: staff.id,
        note: "resolving",
      }),
    ).toMatchObject({ ok: false, reason: "not-paid" });
    expect(
      await db.ledgerEntry.count({ where: { orderId, kind: "REFUND" } }),
    ).toBe(0);
  }),
);

// ----------------------- C5: a dispute can be decided, and freezes the steps

test(
  "staff can resolve a dispute in the buyer's favour",
  withCleanDb(async () => {
    const { orderId, actors, staff, listing } = await runTo("SAFEST", 7);
    await resolveDeal({
      orderId,
      to: "DISPUTED",
      byUserId: actors.buyer,
      note: "seller went quiet",
    });

    // The buyer has already paid the price to us, so completing is the fair
    // outcome — and it is the one the transition table always claimed to
    // allow while no code could perform it.
    expect(
      await resolveDeal({
        orderId,
        to: "COMPLETED",
        byUserId: staff.id,
        note: "transfer confirmed by hand",
      }),
    ).toMatchObject({ ok: true });

    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("COMPLETED");
    expect(
      (await db.listing.findUniqueOrThrow({ where: { id: listing.id } }))
        .status,
    ).toBe("SOLD");
  }),
);

test(
  "no step advances while a dispute is open",
  withCleanDb(async () => {
    const { orderId, actors } = await runTo("FASTEST", 4);
    await resolveDeal({
      orderId,
      to: "DISPUTED",
      byUserId: actors.buyer,
      note: "not as listed",
    });

    // Step 4 carries no status change, so the old code let the seller hand the
    // channel over mid-dispute and then froze the deal with the buyer holding
    // both the channel and a refund claim.
    expect(
      await advanceStep({ orderId, position: 4, userId: actors.seller }),
    ).toMatchObject({ ok: false, reason: "disputed" });
  }),
);

// ------------------- I2: do not return a channel the buyer has paid for

test(
  "returning a channel after the buyer says they paid needs a dispute",
  withCleanDb(async () => {
    const { orderId, staff, buyer, actors } = await runTo("SAFEST", 7);
    // The buyer says they have paid the seller: undoing that is a decision,
    // so it goes through a dispute first.
    expect(
      await resolveDeal({
        orderId,
        to: "RETURNED_TO_SELLER",
        byUserId: staff.id,
        note: "seller changed their mind",
      }),
    ).toMatchObject({ ok: false, reason: "needs-dispute" });

    await resolveDeal({
      orderId,
      to: "DISPUTED",
      byUserId: actors.seller,
      note: "I want my channel back",
    });
    expect(
      await resolveDeal({
        orderId,
        to: "RETURNED_TO_SELLER",
        byUserId: staff.id,
        note: "returned after review",
      }),
    ).toMatchObject({ ok: true });

    // The price never reached us, so there is none to give back: what the
    // buyer paid the seller is between them and the dispute. The fee is the
    // agent's work.
    expect(await balanceOf(buyer.id)).toBe(0);
    expect(await platformPositionFor(orderId)).toBe(300);
  }),
);

test(
  "a safest deal cannot be finished before the buyer says they paid",
  withCleanDb(async () => {
    // Completing hands the buyer the channel, and the price never passes
    // through us: before the buyer has even said they paid the seller, the
    // channel would go for the fee alone.
    const { orderId, staff, actors, listing } = await runTo("SAFEST", 6);
    await resolveDeal({
      orderId,
      to: "DISPUTED",
      byUserId: actors.buyer,
      note: "stuck at the price",
    });
    expect(
      await resolveDeal({
        orderId,
        to: "COMPLETED",
        byUserId: staff.id,
        note: "decided for the buyer",
      }),
    ).toMatchObject({ ok: false, reason: "price-not-paid" });
    expect(
      (await db.listing.findUniqueOrThrow({ where: { id: listing.id } }))
        .status,
    ).toBe("RESERVED");
    expect(
      await db.ledgerEntry.count({ where: { orderId, kind: "BUYER_FEE" } }),
    ).toBe(0);
  }),
);

test(
  "a stuck handover after the seller was paid is decided for the buyer",
  withCleanDb(async () => {
    const { orderId, staff, seller, actors } = await runTo("SAFEST", 8);
    // The seller said the money arrived, but our agent's transfer to the
    // buyer is stuck. The channel cannot go back — the seller has been
    // paid — so the dispute ends for the buyer, with the channel still ours
    // to hand on.
    await resolveDeal({
      orderId,
      to: "DISPUTED",
      byUserId: actors.buyer,
      note: "the transfer never arrived",
    });
    expect(
      await resolveDeal({
        orderId,
        to: "RETURNED_TO_SELLER",
        byUserId: staff.id,
        note: "transfer failed; channel back to the seller",
      }),
    ).toMatchObject({ ok: false, reason: "already-paid" });
    expect(
      await resolveDeal({
        orderId,
        to: "COMPLETED",
        byUserId: staff.id,
        note: "agent re-sent the transfer",
      }),
    ).toMatchObject({ ok: true });
    expect(await balanceOf(seller.id)).toBe(0);
    expect(await platformPositionFor(orderId)).toBe(300);
  }),
);

test(
  "a channel is still returnable before the buyer has paid",
  withCleanDb(async () => {
    const { orderId, staff } = await runTo("SAFEST", 6);
    expect(
      await resolveDeal({
        orderId,
        to: "RETURNED_TO_SELLER",
        byUserId: staff.id,
        note: "buyer unreachable",
      }),
    ).toMatchObject({ ok: true });
  }),
);

// ----------------------- I3: the fee comes back when we did not do the work

test(
  "cancelling before the agent takes custody refunds the admin fee",
  withCleanDb(async () => {
    const { orderId, staff } = await runTo("SAFEST", 2);
    expect(
      await resolveDeal({
        orderId,
        to: "CANCELLED",
        byUserId: staff.id,
        note: "seller never invited the agent",
      }),
    ).toMatchObject({ ok: true });

    // Nothing moved except the fee, and the agent did nothing for it.
    const refund = await db.ledgerEntry.findFirstOrThrow({
      where: { orderId, kind: "REFUND", userId: null },
    });
    expect(refund.amountUsd).toBe(-300);
    expect(await platformPositionFor(orderId)).toBe(0);
    // It was only ever held, so giving it back is not a fee lost.
    expect(
      await db.ledgerEntry.count({ where: { orderId, kind: "BUYER_FEE" } }),
    ).toBe(0);
  }),
);

test(
  "the fee is kept once the agent has held the channel",
  withCleanDb(async () => {
    const { orderId, staff } = await runTo("SAFEST", 6);
    await resolveDeal({
      orderId,
      to: "RETURNED_TO_SELLER",
      byUserId: staff.id,
      note: "buyer never paid",
    });
    expect(
      await db.ledgerEntry.count({ where: { orderId, kind: "REFUND" } }),
    ).toBe(0);
    expect(await platformPositionFor(orderId)).toBe(300);
    // Held at payment, earned now: the hold is released and the fee is
    // booked as income, so nothing is left owed to the buyer.
    const rows = await db.ledgerEntry.findMany({
      where: {
        orderId,
        userId: null,
        kind: { in: ["ESCROW_RELEASE", "BUYER_FEE"] },
      },
      orderBy: { amountUsd: "asc" },
    });
    expect(rows).toMatchObject([
      { kind: "ESCROW_RELEASE", amountUsd: -300 },
      { kind: "BUYER_FEE", amountUsd: 300 },
    ]);
  }),
);

test(
  "returning a paid safest deal needs finance",
  withCleanDb(async () => {
    const { orderId } = await runTo("SAFEST", 6);
    const moderator = await seedUser("MODERATOR");
    expect(
      await resolveDeal({
        orderId,
        to: "RETURNED_TO_SELLER",
        byUserId: moderator.id,
        note: "buyer never paid",
      }),
    ).toMatchObject({ ok: false, reason: "needs-finance" });
  }),
);

test(
  "a refund refuses an order whose hold does not match",
  withCleanDb(async () => {
    const { orderId, staff } = await runTo("SAFEST", 2);
    // A stray row: the books now claim more than this order ever took.
    await db.ledgerEntry.create({
      data: { orderId, userId: null, kind: "ESCROW_HOLD", amountUsd: 1 },
    });
    const before = await db.ledgerEntry.count({ where: { orderId } });
    expect(
      await resolveDeal({
        orderId,
        to: "CANCELLED",
        byUserId: staff.id,
        note: "seller never invited the agent",
      }),
    ).toMatchObject({ ok: false, reason: "books-mismatch" });
    expect(await db.ledgerEntry.count({ where: { orderId } })).toBe(before);
  }),
);

// ------------------------------ I4: the platform's own position has to net

test(
  "a completed fastest deal leaves the platform holding only its fee",
  withCleanDb(async () => {
    const { orderId, seller } = await runTo("FASTEST", 7);
    // Held 10_300, paid out 10_000, keeps 300. Anything else means the books
    // claim to hold money that has been paid away.
    expect(await platformPositionFor(orderId)).toBe(300);
    expect(await balanceOf(seller.id)).toBe(10_000);
  }),
);

test(
  "a completed safest deal leaves the platform holding only its fee",
  withCleanDb(async () => {
    const { orderId, seller } = await runTo("SAFEST", 10);
    // Held 300, the fee, and nothing else: the price went to the seller.
    expect(await platformPositionFor(orderId)).toBe(300);
    // Earned at completion, not at payment.
    expect(
      await db.ledgerEntry.findFirstOrThrow({
        where: { orderId, userId: null, kind: "BUYER_FEE" },
      }),
    ).toMatchObject({ amountUsd: 300 });
    expect(await balanceOf(seller.id)).toBe(0);
  }),
);

test(
  "a refunded fastest deal leaves the platform holding nothing",
  withCleanDb(async () => {
    // Paid, before the seller has given the buyer any access.
    const { orderId, staff } = await runTo("FASTEST", 2);
    await resolveDeal({
      orderId,
      to: "REFUNDED",
      byUserId: staff.id,
      note: "transfer failed",
    });
    expect(await platformPositionFor(orderId)).toBe(0);
  }),
);

// -------------------------------------- I7: proof links cannot be scripts

test(
  "a proof url that is not a plain web link is refused",
  withCleanDb(async () => {
    const { orderId, actors } = await runTo("SAFEST", 3);
    for (const proofUrl of [
      "javascript:alert(document.cookie)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox",
      // Shaped like one of ours but not a key we serve. It used to pass on
      // the prefix alone, which made the whole check a string comparison.
      "/uploads/custody-proof.png",
      "/uploads/../../etc/passwd",
    ]) {
      expect(
        await advanceStep({
          orderId,
          position: 3,
          userId: actors.agent,
          proofUrl,
        }),
      ).toMatchObject({ ok: false, reason: "bad-proof" });
    }
    const step = await db.transferStep.findFirstOrThrow({
      where: { orderId, position: 3 },
    });
    expect(step.completedAt).toBeNull();
  }),
);

test(
  "an uploaded proof path is accepted",
  withCleanDb(async () => {
    const { orderId, actors } = await runTo("SAFEST", 3);
    expect(
      await advanceStep({
        orderId,
        position: 3,
        userId: actors.agent,
        proofUrl: "/uploads/proof/cccccccccccccccccccccccccccccccc.png",
      }),
    ).toMatchObject({ ok: true });
  }),
);

// ---------------------- I1: an abandoned deal does not hold a listing forever

test(
  "an unpaid deal expires on read and frees the listing",
  withCleanDb(async () => {
    const { orderId, listing } = await open("SAFEST");

    // Backdate past the payment window. There is no scheduler yet, so this is
    // evaluated when something looks, the way stale offers already are.
    await db.order.update({
      where: { id: orderId },
      data: { createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72) },
    });

    const { expireStaleDeals } = await import("@/server/deals");
    expect(await expireStaleDeals()).toBe(1);

    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("PAYMENT_EXPIRED");
    expect(
      (await db.listing.findUniqueOrThrow({ where: { id: listing.id } }))
        .status,
    ).toBe("LIVE");
  }),
);

test(
  "a paid deal is never expired",
  withCleanDb(async () => {
    const { orderId } = await open("SAFEST");
    await recordOpeningPayment(orderId, "pay-keep", "USDT");
    await db.order.update({
      where: { id: orderId },
      data: { createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72) },
    });

    const { expireStaleDeals } = await import("@/server/deals");
    expect(await expireStaleDeals()).toBe(0);
  }),
);

test(
  "an abandoned deal stops blocking the listing for the next buyer",
  withCleanDb(async () => {
    const { orderId, listing } = await open("SAFEST");
    await db.order.update({
      where: { id: orderId },
      data: { createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72) },
    });

    // The listing is RESERVED by a deal nobody ever paid for. Before this,
    // that was permanent and anyone could do it to any listing for free.
    const next = await seedUser();
    const result = await createDeal({
      listingId: listing.id,
      buyerId: next.id,
      mode: "SAFEST",
    });
    expect(result.ok).toBe(true);

    const abandoned = await db.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(abandoned.status).toBe("PAYMENT_EXPIRED");
  }),
);

test(
  "a listing reserved by a fresh deal is still not buyable",
  withCleanDb(async () => {
    const { listing } = await open("SAFEST");
    const next = await seedUser();
    expect(
      await createDeal({
        listingId: listing.id,
        buyerId: next.id,
        mode: "SAFEST",
      }),
    ).toMatchObject({ ok: false, reason: "not-live" });
  }),
);
