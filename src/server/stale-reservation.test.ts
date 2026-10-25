import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { createDeal, recordOpeningPayment } from "@/server/deals";
import { saleState } from "@/server/listing-hold";
import { acceptOffer, createOffer } from "@/server/offers";
import { creditDeposit, payFromWallet } from "@/server/wallet";
import { seedListing, seedUser, withCleanDb } from "@/test/db";

// The owner (2026-10-26): a deal's own buyer pressed Pay and was told
// "Another buyer paid for this listing first". Nobody had. The deal was
// opened before 2026-10-24, when opening a deal reserved the listing, so
// the listing was reserved by that very deal, and the payment — which
// takes only a listing on sale — refused it. And where a listing really
// has gone, the deal should close rather than wait for a payment it can
// never take.

const status = async (id: string) =>
  (await db.listing.findUniqueOrThrow({ where: { id } })).status;

const orderStatus = async (id: string) =>
  (await db.order.findUniqueOrThrow({ where: { id } })).status;

/** A deal opened under the old rule: the listing reserved, nothing paid. */
async function oldUnpaidDeal() {
  const seeded = await seedListing();
  const deal = await createDeal({
    listingId: seeded.listing.id,
    buyerId: seeded.buyer.id,
    mode: "FASTEST",
  });
  if (!deal.ok) throw new Error(deal.reason);
  await db.listing.update({
    where: { id: seeded.listing.id },
    data: { status: "RESERVED" },
  });
  return { ...seeded, ...deal };
}

test(
  "the deal's own buyer can pay from their balance for a listing reserved by nobody",
  withCleanDb(async () => {
    const t = await oldUnpaidDeal();
    await creditDeposit(t.buyer.id, 50_000, `fund-${randomUUID()}`, "USDT");

    expect(await payFromWallet(t.orderId, t.buyer.id)).toEqual({ ok: true });
    expect(await orderStatus(t.orderId)).toBe("AGENT_VERIFYING");
    expect(await status(t.listing.id)).toBe("RESERVED");
  }),
);

test(
  "and by crypto",
  withCleanDb(async () => {
    const t = await oldUnpaidDeal();
    expect(await recordOpeningPayment(t.orderId, "pay-1", "USDT")).toBe(
      "applied",
    );
    expect(await status(t.listing.id)).toBe("RESERVED");
  }),
);

test(
  "asking before payment puts a listing reserved by nobody back on sale",
  withCleanDb(async () => {
    const t = await oldUnpaidDeal();
    expect(await saleState({ listingId: t.listing.id, offerId: null })).toBe(
      "for-sale",
    );
    expect(await status(t.listing.id)).toBe("LIVE");
  }),
);

test(
  "a listing that has gone closes the deal when its buyer tries to pay",
  withCleanDb(async () => {
    const seeded = await seedListing();
    const deal = await createDeal({
      listingId: seeded.listing.id,
      buyerId: seeded.buyer.id,
      mode: "FASTEST",
    });
    if (!deal.ok) throw new Error(deal.reason);
    await creditDeposit(
      seeded.buyer.id,
      50_000,
      `fund-${randomUUID()}`,
      "USDT",
    );
    // The seller took it off sale while the deal waited to be paid.
    await db.listing.update({
      where: { id: seeded.listing.id },
      data: { status: "PAUSED" },
    });

    expect(await payFromWallet(deal.orderId, seeded.buyer.id)).toEqual({
      ok: false,
      reason: "taken",
    });
    expect(await orderStatus(deal.orderId)).toBe("CANCELLED");
    const lines = await db.message.findMany({
      where: { conversationId: deal.conversationId, kind: "EVENT" },
      select: { body: true },
    });
    expect(lines.map((l) => l.body).join(" ")).toMatch(/no longer for sale/i);
    // Nothing was taken from them.
    const balance = await db.ledgerEntry.aggregate({
      where: { userId: seeded.buyer.id },
      _sum: { amountUsd: true },
    });
    expect(balance._sum.amountUsd).toBe(50_000);
  }),
);

test(
  "a listing held by the seller's accepted offer to someone else leaves the deal open",
  withCleanDb(async () => {
    const seeded = await seedListing();
    const bidder = await seedUser();
    const deal = await createDeal({
      listingId: seeded.listing.id,
      buyerId: seeded.buyer.id,
      mode: "FASTEST",
    });
    if (!deal.ok) throw new Error(deal.reason);
    const offer = await createOffer({
      listingId: seeded.listing.id,
      buyerId: bidder.id,
      amountCents: 9_000,
      message: null,
      expiryHours: 48,
    });
    if (!offer.ok) throw new Error(offer.reason);
    const accepted = await acceptOffer(
      offer.value.offerId,
      seeded.seller.id,
      "seller",
    );
    if (!accepted.ok) throw new Error(accepted.reason);

    expect(
      await saleState({ listingId: seeded.listing.id, offerId: null }),
    ).toBe("held");
    await creditDeposit(
      seeded.buyer.id,
      50_000,
      `fund-${randomUUID()}`,
      "USDT",
    );
    expect(await payFromWallet(deal.orderId, seeded.buyer.id)).toEqual({
      ok: false,
      reason: "held",
    });
    expect(await orderStatus(deal.orderId)).toBe("AWAITING_PAYMENT");
  }),
);

test(
  "the migration frees listings reserved by nobody and leaves held ones",
  withCleanDb(async () => {
    const stale = await oldUnpaidDeal();

    const paid = await seedListing();
    const paidDeal = await createDeal({
      listingId: paid.listing.id,
      buyerId: paid.buyer.id,
      mode: "FASTEST",
    });
    if (!paidDeal.ok) throw new Error(paidDeal.reason);
    await recordOpeningPayment(paidDeal.orderId, "pay-held", "USDT");

    const offered = await seedListing();
    const offer = await createOffer({
      listingId: offered.listing.id,
      buyerId: offered.buyer.id,
      amountCents: 9_000,
      message: null,
      expiryHours: 48,
    });
    if (!offer.ok) throw new Error(offer.reason);
    const accepted = await acceptOffer(
      offer.value.offerId,
      offered.seller.id,
      "seller",
    );
    if (!accepted.ok) throw new Error(accepted.reason);

    await db.$executeRawUnsafe(
      readFileSync(
        "prisma/migrations/20261026120000_free_unheld_reservations/migration.sql",
        "utf8",
      ),
    );

    expect(await status(stale.listing.id)).toBe("LIVE");
    expect(await status(paid.listing.id)).toBe("RESERVED");
    expect(await status(offered.listing.id)).toBe("RESERVED");
  }),
);
