import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { balanceOf, createDeal, recordOpeningPayment } from "@/server/deals";
import { seedListing, seedUser, withCleanDb } from "@/test/db";

async function openDeal(mode: "SAFEST" | "FASTEST" = "SAFEST") {
  const seeded = await seedListing();
  const result = await createDeal({
    listingId: seeded.listing.id,
    buyerId: seeded.buyer.id,
    mode,
  });
  if (!result.ok) throw new Error(`createDeal failed: ${result.reason}`);
  return { ...seeded, orderId: result.orderId, reference: result.reference };
}

test(
  "a new deal hands back its chat, so the buyer can be taken straight there",
  withCleanDb(async () => {
    // The owner: after starting a deal the buyer landed on the deal page and
    // had to press through to the chat, which is where the deal is run.
    const seeded = await seedListing();
    const result = await createDeal({
      listingId: seeded.listing.id,
      buyerId: seeded.buyer.id,
      mode: "SAFEST",
    });
    if (!result.ok) throw new Error(result.reason);

    const order = await db.order.findUniqueOrThrow({
      where: { id: result.orderId },
    });
    expect(result.conversationId).toBeTruthy();
    expect(result.conversationId).toBe(order.conversationId);
  }),
);

test(
  "creating a safest deal reserves the listing and seeds eight steps",
  withCleanDb(async () => {
    const { listing, buyer, orderId, reference } = await openDeal("SAFEST");

    const order = await db.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { steps: { orderBy: { position: "asc" } } },
    });

    expect(order.status).toBe("AWAITING_PAYMENT");
    expect(order.mode).toBe("SAFEST");
    expect(order.buyerId).toBe(buyer.id);
    // The buyer owes Channel Adda the 3% admin fee and nothing else; the
    // price goes to the seller directly, at step 6.
    expect(order.priceUsd).toBe(10_000);
    expect(order.buyerFeeUsd).toBe(300);
    expect(order.totalUsd).toBe(300);
    expect(order.steps).toHaveLength(8);
    expect(order.steps[5].label).toBe("Pay the seller");
    expect(reference).toMatch(/^CA-\d{5}$/);

    const after = await db.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(after.status).toBe("RESERVED");
  }),
);

test(
  "creating a fastest deal charges the price and the fee together",
  withCleanDb(async () => {
    const { orderId } = await openDeal("FASTEST");
    const order = await db.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { steps: true },
    });
    expect(order.totalUsd).toBe(10_300);
    expect(order.steps).toHaveLength(6);
  }),
);

test(
  "a seller cannot buy their own listing",
  withCleanDb(async () => {
    const { listing, seller } = await seedListing();
    const result = await createDeal({
      listingId: listing.id,
      buyerId: seller.id,
      mode: "SAFEST",
    });
    expect(result).toMatchObject({ ok: false, reason: "own-listing" });
  }),
);

test(
  "a listing that is not live cannot be bought",
  withCleanDb(async () => {
    const { listing, buyer } = await seedListing({ listingStatus: "DRAFT" });
    const result = await createDeal({
      listingId: listing.id,
      buyerId: buyer.id,
      mode: "SAFEST",
    });
    expect(result).toMatchObject({ ok: false, reason: "not-live" });
  }),
);

test(
  "an unknown listing is not found",
  withCleanDb(async () => {
    const { buyer } = await seedListing();
    const result = await createDeal({
      listingId: "does-not-exist",
      buyerId: buyer.id,
      mode: "SAFEST",
    });
    expect(result).toMatchObject({ ok: false, reason: "not-found" });
  }),
);

test(
  "only one of two simultaneous buyers wins the listing",
  withCleanDb(async () => {
    const { listing, buyer } = await seedListing();
    const other = await seedUser();

    const results = await Promise.all([
      createDeal({ listingId: listing.id, buyerId: buyer.id, mode: "SAFEST" }),
      createDeal({ listingId: listing.id, buyerId: other.id, mode: "SAFEST" }),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ reason: "taken" });
    expect(await db.order.count()).toBe(1);
  }),
);

test(
  "a paid safest deal holds the fee, it does not earn it yet",
  withCleanDb(async () => {
    const { orderId, seller } = await openDeal("SAFEST");
    await recordOpeningPayment(orderId, "cryptomus-1", "USDT");

    // Held, like everything a buyer pays: the fee only becomes income when
    // the agent has done the work, so a refund before custody is not a
    // fee given back.
    const rows = await db.ledgerEntry.findMany({ where: { orderId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "ESCROW_HOLD",
      amountUsd: 300,
      userId: null,
    });
    expect(
      await db.ledgerEntry.count({ where: { orderId, kind: "BUYER_FEE" } }),
    ).toBe(0);
    expect(await balanceOf(seller.id)).toBe(0);

    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("AWAITING_CUSTODY");
    expect(order.feePaidAt).not.toBeNull();
    expect(order.paymentRef).toBe("cryptomus-1");
    expect(order.paymentAsset).toBe("USDT");
  }),
);

test(
  "a paid fastest deal holds the whole amount with the platform",
  withCleanDb(async () => {
    const { orderId, seller } = await openDeal("FASTEST");
    await recordOpeningPayment(orderId, "cryptomus-2", "BTC");

    const rows = await db.ledgerEntry.findMany({ where: { orderId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "ESCROW_HOLD",
      amountUsd: 10_300,
      userId: null,
    });
    expect(await balanceOf(seller.id)).toBe(0);

    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("AGENT_VERIFYING");
  }),
);

test(
  "a repeated payment reference is a no-op",
  withCleanDb(async () => {
    const { orderId } = await openDeal("SAFEST");
    await recordOpeningPayment(orderId, "cryptomus-1", "USDT");
    await recordOpeningPayment(orderId, "cryptomus-1", "USDT");

    expect(await db.ledgerEntry.count({ where: { orderId } })).toBe(1);
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("AWAITING_CUSTODY");
  }),
);

test(
  "the opening payment completes the first step",
  withCleanDb(async () => {
    const { orderId } = await openDeal("SAFEST");
    await recordOpeningPayment(orderId, "cryptomus-1", "USDT");
    const step = await db.transferStep.findFirstOrThrow({
      where: { orderId, position: 1 },
    });
    expect(step.completedAt).not.toBeNull();
  }),
);

test(
  "a balance is the sum of that user's ledger rows",
  withCleanDb(async () => {
    const { seller, orderId } = await openDeal("FASTEST");
    await db.ledgerEntry.createMany({
      data: [
        {
          userId: seller.id,
          orderId,
          kind: "ESCROW_RELEASE",
          amountUsd: 10_000,
        },
        { userId: seller.id, orderId, kind: "SELLER_FEE", amountUsd: -500 },
        // A platform row must never count towards anyone's balance.
        { userId: null, orderId, kind: "BUYER_FEE", amountUsd: 300 },
      ],
    });
    expect(await balanceOf(seller.id)).toBe(9_500);
  }),
);

test(
  "the revenue-risk acknowledgement is recorded on the order",
  withCleanDb(async () => {
    // The refund policy, the Terms and the help centre all say the buyer
    // acknowledges this at checkout. The column existed from the first
    // migration and nothing ever wrote it — so a dispute about lost
    // monetization was refused on the strength of a consent that did not
    // exist anywhere.
    const seeded = await seedListing();
    const created = await createDeal({
      listingId: seeded.listing.id,
      buyerId: seeded.buyer.id,
      mode: "FASTEST",
      acceptedRevenueRisk: true,
    });
    if (!created.ok) throw new Error(created.reason);

    const order = await db.order.findUniqueOrThrow({
      where: { id: created.orderId },
    });
    expect(order.revenueRiskAcceptedAt).not.toBeNull();
  }),
);
