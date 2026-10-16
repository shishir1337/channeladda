import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { templateFor } from "@/lib/deal-templates";
import {
  advanceStep,
  balanceOf,
  createDeal,
  getDealFor,
  recordOpeningPayment,
  resolveDeal,
} from "@/server/deals";
import { seedListing, seedUser, withCleanDb } from "@/test/db";

type Mode = "SAFEST" | "FASTEST";

/**
 * Walks a deal from a cleared opening payment up to — but not including —
 * `stopBefore`, so each test can start from the exact step it is about.
 */
async function runTo(
  mode: Mode,
  stopBefore: number,
  opts: { assignAgent?: boolean; sellerFeeBp?: number } = {},
) {
  const seeded = await seedListing(
    opts.sellerFeeBp === undefined
      ? {}
      : { settings: { sellerFeeBp: opts.sellerFeeBp } },
  );
  const staff = await seedUser("MODERATOR");

  const created = await createDeal({
    listingId: seeded.listing.id,
    buyerId: seeded.buyer.id,
    mode,
  });
  if (!created.ok) throw new Error(`createDeal: ${created.reason}`);
  const { orderId } = created;

  if (opts.assignAgent !== false) {
    await db.order.update({
      where: { id: orderId },
      data: {
        agentId: seeded.agent.id,
        agentEmail: "transfers@channeladda.test",
        agentBrand: "Channel Adda Transfers",
      },
    });
  }

  await recordOpeningPayment(orderId, `pay-${orderId}`, "USDT");

  const actors: Record<string, string> = {
    buyer: seeded.buyer.id,
    seller: seeded.seller.id,
    agent: seeded.agent.id,
  };

  for (const step of templateFor(mode)) {
    if (step.position < 2 || step.position >= stopBefore) continue;
    const result = await advanceStep({
      orderId,
      position: step.position,
      userId: actors[step.actor],
      ...(mode === "SAFEST" && step.position === 6
        ? { paymentRef: "0xabc" }
        : {}),
    });
    if (!result.ok) {
      throw new Error(`step ${step.position} failed: ${result.reason}`);
    }
  }

  return { ...seeded, orderId, staff, actors };
}

const listingStatus = async (id: string) =>
  (await db.listing.findUniqueOrThrow({ where: { id } })).status;

// ---------------------------------------------------------------- advancement

test(
  "a safest deal runs end to end",
  withCleanDb(async () => {
    const { orderId, listing, seller } = await runTo("SAFEST", 10);

    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("COMPLETED");
    expect(order.custodyAt).not.toBeNull();
    expect(order.buyerPaidAt).not.toBeNull();
    expect(order.sellerConfirmedAt).not.toBeNull();
    expect(order.handoverAt).not.toBeNull();
    expect(await listingStatus(listing.id)).toBe("SOLD");

    // The platform never held the price, so it never released it either.
    expect(
      await db.ledgerEntry.count({
        where: { orderId, kind: "ESCROW_RELEASE" },
      }),
    ).toBe(0);
    expect(await balanceOf(seller.id)).toBe(0);
  }),
);

test(
  "a fastest deal credits the seller on release",
  withCleanDb(async () => {
    const { orderId, seller, listing } = await runTo("FASTEST", 7);

    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("COMPLETED");
    expect(await listingStatus(listing.id)).toBe("SOLD");

    // sellerFeeBp is 0 by default, so the seller receives the whole price.
    expect(await balanceOf(seller.id)).toBe(10_000);
    const release = await db.ledgerEntry.findFirstOrThrow({
      where: { orderId, kind: "ESCROW_RELEASE" },
    });
    expect(release).toMatchObject({ userId: seller.id, amountUsd: 10_000 });
    expect(
      await db.ledgerEntry.count({ where: { orderId, kind: "BUYER_FEE" } }),
    ).toBe(1);
  }),
);

test(
  "a fastest deal deducts a seller fee when one is set",
  withCleanDb(async () => {
    const { seller } = await runTo("FASTEST", 7, { sellerFeeBp: 500 });
    expect(await balanceOf(seller.id)).toBe(9_500);
  }),
);

test(
  "steps cannot be done out of order",
  withCleanDb(async () => {
    const { orderId, actors } = await runTo("SAFEST", 2);
    expect(
      await advanceStep({ orderId, position: 5, userId: actors.buyer }),
    ).toMatchObject({ ok: false, reason: "wrong-step" });
  }),
);

test(
  "a step already done cannot be done again",
  withCleanDb(async () => {
    const { orderId, actors } = await runTo("SAFEST", 3);
    expect(
      await advanceStep({ orderId, position: 2, userId: actors.seller }),
    ).toMatchObject({ ok: false, reason: "wrong-step" });
  }),
);

test(
  "the wrong actor is rejected",
  withCleanDb(async () => {
    // Step 3 belongs to the agent; the buyer must not be able to confirm it.
    const { orderId, actors } = await runTo("SAFEST", 3);
    expect(
      await advanceStep({ orderId, position: 3, userId: actors.buyer }),
    ).toMatchObject({ ok: false, reason: "wrong-actor" });
  }),
);

test(
  "the right role on someone else's deal is rejected",
  withCleanDb(async () => {
    // Step 2 is a seller's step. Someone who is a seller elsewhere is still
    // not this deal's seller — role is not ownership.
    const { orderId } = await runTo("SAFEST", 2);
    const outsider = await seedUser();
    expect(
      await advanceStep({ orderId, position: 2, userId: outsider.id }),
    ).toMatchObject({ ok: false, reason: "wrong-actor" });
  }),
);

test(
  "an unassigned agent cannot act on a deal",
  withCleanDb(async () => {
    const { orderId, actors } = await runTo("SAFEST", 3, {
      assignAgent: false,
    });
    expect(
      await advanceStep({ orderId, position: 3, userId: actors.agent }),
    ).toMatchObject({ ok: false, reason: "wrong-actor" });
  }),
);

test(
  "the buyer's direct payment records its reference",
  withCleanDb(async () => {
    const { orderId, actors } = await runTo("SAFEST", 6);
    expect(
      await advanceStep({
        orderId,
        position: 6,
        userId: actors.buyer,
        paymentRef: "0xdeadbeef",
      }),
    ).toMatchObject({ ok: true });

    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.buyerPaymentRef).toBe("0xdeadbeef");
    expect(order.buyerPaidAt).not.toBeNull();
  }),
);

test(
  "a completed deal rejects further steps",
  withCleanDb(async () => {
    const { orderId, actors } = await runTo("SAFEST", 10);
    expect(
      await advanceStep({ orderId, position: 9, userId: actors.agent }),
    ).toMatchObject({ ok: false, reason: "terminal" });
  }),
);

test(
  "a step records proof when the actor supplies it",
  withCleanDb(async () => {
    const { orderId, actors } = await runTo("SAFEST", 3);
    await advanceStep({
      orderId,
      position: 3,
      userId: actors.agent,
      proofUrl: "/uploads/custody.png",
    });
    const step = await db.transferStep.findFirstOrThrow({
      where: { orderId, position: 3 },
    });
    expect(step.proofUrl).toBe("/uploads/custody.png");
  }),
);

// ---------------------------------------------------------------- resolution

test(
  "an abandoned safest deal returns the channel and keeps the fee",
  withCleanDb(async () => {
    const { orderId, listing, staff } = await runTo("SAFEST", 6);

    expect(
      await resolveDeal({
        orderId,
        to: "RETURNED_TO_SELLER",
        byUserId: staff.id,
        note: "buyer unreachable",
      }),
    ).toMatchObject({ ok: true });

    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("RETURNED_TO_SELLER");
    expect(await listingStatus(listing.id)).toBe("LIVE");

    // The fee is kept and nothing is refunded.
    expect(
      await db.ledgerEntry.count({ where: { orderId, kind: "BUYER_FEE" } }),
    ).toBe(1);
    expect(
      await db.ledgerEntry.count({ where: { orderId, kind: "REFUND" } }),
    ).toBe(0);
  }),
);

test(
  "a refunded fastest deal reverses the hold",
  withCleanDb(async () => {
    const { orderId, staff, listing } = await runTo("FASTEST", 4);

    expect(
      await resolveDeal({
        orderId,
        to: "REFUNDED",
        byUserId: staff.id,
        note: "transfer failed",
      }),
    ).toMatchObject({ ok: true });

    const refund = await db.ledgerEntry.findFirstOrThrow({
      where: { orderId, kind: "REFUND" },
    });
    expect(refund).toMatchObject({ amountUsd: -10_300, userId: null });
    expect(await listingStatus(listing.id)).toBe("LIVE");
  }),
);

test(
  "either side can dispute a live deal",
  withCleanDb(async () => {
    const { orderId, actors } = await runTo("SAFEST", 5);
    expect(
      await resolveDeal({
        orderId,
        to: "DISPUTED",
        byUserId: actors.buyer,
        note: "not as listed",
      }),
    ).toMatchObject({ ok: true });
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("DISPUTED");
  }),
);

test(
  "a buyer cannot cancel their way out after custody",
  withCleanDb(async () => {
    const { orderId, actors } = await runTo("SAFEST", 5);
    expect(
      await resolveDeal({
        orderId,
        to: "CANCELLED",
        byUserId: actors.buyer,
        note: "changed my mind",
      }),
    ).toMatchObject({ ok: false, reason: "wrong-actor" });
  }),
);

test(
  "a buyer cannot refund themselves",
  withCleanDb(async () => {
    const { orderId, actors } = await runTo("FASTEST", 4);
    expect(
      await resolveDeal({
        orderId,
        to: "REFUNDED",
        byUserId: actors.buyer,
        note: "I would like my money back",
      }),
    ).toMatchObject({ ok: false, reason: "wrong-actor" });
    expect(
      await db.ledgerEntry.count({ where: { orderId, kind: "REFUND" } }),
    ).toBe(0);
  }),
);

test(
  "a resolved deal cannot be resolved again",
  withCleanDb(async () => {
    const { orderId, staff } = await runTo("SAFEST", 6);
    await resolveDeal({
      orderId,
      to: "RETURNED_TO_SELLER",
      byUserId: staff.id,
      note: "first",
    });
    expect(
      await resolveDeal({
        orderId,
        to: "RETURNED_TO_SELLER",
        byUserId: staff.id,
        note: "second",
      }),
    ).toMatchObject({ ok: false, reason: "terminal" });
  }),
);

// ---------------------------------------------------------------- the view

test(
  "a deal view tells each side what is theirs to do",
  withCleanDb(async () => {
    const { orderId, actors, buyer, seller } = await runTo("SAFEST", 3);

    const asBuyer = await getDealFor(buyer.id, orderId);
    expect(asBuyer?.viewerRole).toBe("buyer");
    expect(asBuyer?.nextStep?.position).toBe(3);
    expect(asBuyer?.nextStep?.actor).toBe("agent");
    expect(asBuyer?.agentEmail).toBe("transfers@channeladda.test");
    expect(asBuyer?.agentBrand).toBe("Channel Adda Transfers");
    expect(asBuyer?.steps).toHaveLength(9);
    expect(asBuyer?.totalUsd).toBe(300);

    expect((await getDealFor(seller.id, orderId))?.viewerRole).toBe("seller");
    expect((await getDealFor(actors.agent, orderId))?.viewerRole).toBe("agent");
  }),
);

test(
  "a deal view is null for someone not in the deal",
  withCleanDb(async () => {
    const { orderId } = await runTo("SAFEST", 2);
    const outsider = await seedUser();
    expect(await getDealFor(outsider.id, orderId)).toBeNull();
  }),
);

test(
  "a completed deal has no next step",
  withCleanDb(async () => {
    const { orderId, buyer } = await runTo("SAFEST", 10);
    const view = await getDealFor(buyer.id, orderId);
    expect(view?.status).toBe("COMPLETED");
    expect(view?.nextStep).toBeNull();
  }),
);
