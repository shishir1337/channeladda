import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import { db } from "@/lib/db";
import {
  createDeal,
  expireStaleDeals,
  recordOpeningPayment,
  resolveDeal,
} from "@/server/deals";
import { recordInvoice } from "@/server/invoices";
import { createOffer } from "@/server/offers";
import { creditDeposit, payFromWallet } from "@/server/wallet";
import { seedListing, seedUser, withCleanDb } from "@/test/db";

// The owner: "the listing is reserved so I didn't pay yet ... people can
// spam this and make someone's listing always reserved, so we can show the
// listing until someone paid". Only a paid deal — or one from an offer the
// seller accepted — holds a listing. Everyone else may still buy it, and
// the first payment wins.

const listingStatus = async (id: string) =>
  (await db.listing.findUniqueOrThrow({ where: { id } })).status;

async function open(listingId: string, buyerId: string) {
  const deal = await createDeal({ listingId, buyerId, mode: "FASTEST" });
  if (!deal.ok) throw new Error(`could not open: ${deal.reason}`);
  return deal;
}

async function fund(userId: string, cents: number) {
  await creditDeposit(userId, cents, `fund-${randomUUID()}`, "USDT");
}

test(
  "opening a deal leaves the listing on sale, and a second buyer can open one too",
  withCleanDb(async () => {
    const { listing, buyer } = await seedListing();
    const other = await seedUser();

    await open(listing.id, buyer.id);
    expect(await listingStatus(listing.id)).toBe("LIVE");
    await open(listing.id, other.id);
    expect(
      await db.order.count({ where: { status: "AWAITING_PAYMENT" } }),
    ).toBe(2);
  }),
);

test(
  "the first payment reserves the listing and closes everyone else's unpaid deal",
  withCleanDb(async () => {
    const { listing, buyer } = await seedListing();
    const other = await seedUser();
    const first = await open(listing.id, buyer.id);
    const second = await open(listing.id, other.id);

    expect(await recordOpeningPayment(first.orderId, "pay-1", "USDT")).toBe(
      "applied",
    );
    expect(await listingStatus(listing.id)).toBe("RESERVED");

    const lost = await db.order.findUniqueOrThrow({
      where: { id: second.orderId },
    });
    expect(lost.status).toBe("CANCELLED");
    const lines = await db.message.findMany({
      where: { conversationId: second.conversationId, kind: "EVENT" },
      select: { body: true },
    });
    expect(lines.map((l) => l.body).join(" ")).toMatch(/paid first/i);
    expect(
      await db.notification.count({ where: { userId: other.id } }),
    ).toBeGreaterThan(0);
  }),
);

test(
  "money that arrives for a deal somebody else already won goes to the buyer's balance",
  withCleanDb(async () => {
    const { listing, buyer } = await seedListing();
    const other = await seedUser();
    const first = await open(listing.id, buyer.id);
    const second = await open(listing.id, other.id);

    await recordOpeningPayment(first.orderId, "pay-1", "USDT");
    expect(await recordOpeningPayment(second.orderId, "pay-2", "USDT")).toBe(
      "credited-to-balance",
    );

    const refund = await db.ledgerEntry.aggregate({
      where: { userId: other.id },
      _sum: { amountUsd: true },
    });
    const order = await db.order.findUniqueOrThrow({
      where: { id: second.orderId },
    });
    expect(refund._sum.amountUsd).toBe(order.totalUsd);
    expect(await listingStatus(listing.id)).toBe("RESERVED");
  }),
);

test(
  "two payments landing together: one deal wins, the other buyer keeps their money",
  withCleanDb(async () => {
    const { listing, buyer } = await seedListing();
    const other = await seedUser();
    const first = await open(listing.id, buyer.id);
    const second = await open(listing.id, other.id);

    const outcomes = await Promise.all([
      recordOpeningPayment(first.orderId, "pay-1", "USDT"),
      recordOpeningPayment(second.orderId, "pay-2", "USDT"),
    ]);
    expect(outcomes.filter((o) => o === "applied")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "credited-to-balance")).toHaveLength(1);
    expect(
      await db.order.count({
        where: { listingId: listing.id, paymentRef: { not: null } },
      }),
    ).toBe(1);
  }),
);

test(
  "paying from the balance: the first wins, the second is not charged",
  withCleanDb(async () => {
    const { listing, buyer } = await seedListing();
    const other = await seedUser();
    const first = await open(listing.id, buyer.id);
    const second = await open(listing.id, other.id);
    await fund(buyer.id, 50_000);
    await fund(other.id, 50_000);

    const results = await Promise.all([
      payFromWallet(first.orderId, buyer.id),
      payFromWallet(second.orderId, other.id),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);

    const loser = results[0].ok ? other : buyer;
    const balance = await db.ledgerEntry.aggregate({
      where: { userId: loser.id },
      _sum: { amountUsd: true },
    });
    expect(balance._sum.amountUsd).toBe(50_000);
    expect(await listingStatus(listing.id)).toBe("RESERVED");
  }),
);

test(
  "a buyer paying by crypto holds the listing for the hour their first invoice lasts",
  withCleanDb(async () => {
    const { listing, buyer } = await seedListing();
    const other = await seedUser();
    const paying = await open(listing.id, buyer.id);
    const waiting = await open(listing.id, other.id);
    await fund(other.id, 50_000);

    const reference = `DEAL-${randomUUID()}`;
    await recordInvoice({
      reference,
      purpose: "DEAL",
      amountUsd: 10_300,
      userId: buyer.id,
      orderId: paying.orderId,
    });
    expect(await payFromWallet(waiting.orderId, other.id)).toEqual({
      ok: false,
      reason: "being-paid",
    });

    // An hour on, the hold is over and the listing is anyone's again.
    await db.invoice.update({
      where: { reference },
      data: { createdAt: new Date(Date.now() - 61 * 60 * 1000) },
    });
    expect(await payFromWallet(waiting.orderId, other.id)).toEqual({
      ok: true,
    });
  }),
);

test(
  "opening a deal declines nobody's offer; paying for one does",
  withCleanDb(async () => {
    const { listing, buyer } = await seedListing();
    const bidder = await seedUser();
    const offer = await createOffer({
      listingId: listing.id,
      buyerId: bidder.id,
      amountCents: 8_000,
      message: null,
      expiryHours: 48,
    });
    if (!offer.ok) throw new Error(`offer: ${offer.reason}`);

    const deal = await open(listing.id, buyer.id);
    expect(
      (await db.offer.findUniqueOrThrow({ where: { id: offer.value.offerId } }))
        .status,
    ).toBe("OPEN");

    await recordOpeningPayment(deal.orderId, "pay-1", "USDT");
    expect(
      (await db.offer.findUniqueOrThrow({ where: { id: offer.value.offerId } }))
        .status,
    ).toBe("REJECTED");
  }),
);

test(
  "pressing Start again returns the same deal, and a buyer may have three unpaid at once",
  withCleanDb(async () => {
    const { buyer } = await seedListing();
    const listings = await Promise.all([1, 2, 3, 4].map(() => seedListing()));

    const first = await open(listings[0].listing.id, buyer.id);
    const again = await open(listings[0].listing.id, buyer.id);
    expect(again.orderId).toBe(first.orderId);

    await open(listings[1].listing.id, buyer.id);
    await open(listings[2].listing.id, buyer.id);
    expect(
      await createDeal({
        listingId: listings[3].listing.id,
        buyerId: buyer.id,
        mode: "FASTEST",
      }),
    ).toEqual({ ok: false, reason: "too-many-unpaid" });
  }),
);

test(
  "an unpaid deal ending never puts somebody else's reserved listing back on sale",
  withCleanDb(async () => {
    const { listing, buyer } = await seedListing();
    const other = await seedUser();
    const unpaid = await open(listing.id, other.id);
    const paid = await open(listing.id, buyer.id);

    // Cancel the unpaid one before the paid one lands, then lapse what is left.
    await resolveDeal({
      orderId: unpaid.orderId,
      to: "CANCELLED",
      byUserId: other.id,
      note: "changed my mind",
    });
    await recordOpeningPayment(paid.orderId, "pay-1", "USDT");
    await db.order.updateMany({
      where: { id: unpaid.orderId },
      data: { createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72) },
    });
    await expireStaleDeals();

    expect(await listingStatus(listing.id)).toBe("RESERVED");
  }),
);

test(
  "a listing an old unpaid deal left reserved is freed for the next buyer",
  withCleanDb(async () => {
    // Before this change, opening a deal reserved the listing. A deploy
    // leaves some held that way, by deals nobody paid for.
    const { listing, buyer } = await seedListing();
    const next = await seedUser();
    await open(listing.id, buyer.id);
    await db.listing.update({
      where: { id: listing.id },
      data: { status: "RESERVED" },
    });

    const deal = await createDeal({
      listingId: listing.id,
      buyerId: next.id,
      mode: "FASTEST",
    });
    expect(deal.ok).toBe(true);
    expect(await listingStatus(listing.id)).toBe("LIVE");
  }),
);
