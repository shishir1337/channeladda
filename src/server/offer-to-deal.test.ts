import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { createDeal } from "@/server/deals";
import {
  acceptOffer,
  createOffer,
  releaseLapsedOfferReservations,
} from "@/server/offers";
import { seedListing, seedUser, withCleanDb } from "@/test/db";

/**
 * An accepted offer has to become a deal.
 *
 * Accepting an offer reserved the listing and created nothing else. createDeal
 * refused a RESERVED listing and priced every deal from the asking price — so
 * the buyer whose offer was accepted could not open the deal at all, the
 * agreed price could never reach an order, and nothing could put the listing
 * back on sale. One click on Accept took a listing off the marketplace for
 * good, and the button was live.
 */
async function acceptedOffer(amountCents = 8_000) {
  const seeded = await seedListing({ priceUsd: 10_000 });
  const made = await createOffer({
    buyerId: seeded.buyer.id,
    listingId: seeded.listing.id,
    amountCents,
    message: null,
    expiryHours: 48,
  });
  if (!made.ok) throw new Error(made.reason);
  const accepted = await acceptOffer(
    made.value.offerId,
    seeded.seller.id,
    "seller",
  );
  if (!accepted.ok) throw new Error(accepted.reason);
  return { ...seeded, offerId: made.value.offerId };
}

test(
  "the buyer whose offer was accepted can open the deal, at the offer price",
  withCleanDb(async () => {
    const o = await acceptedOffer(8_000);

    const created = await createDeal({
      listingId: o.listing.id,
      buyerId: o.buyer.id,
      mode: "FASTEST",
    });

    expect(created).toMatchObject({ ok: true });
    if (!created.ok) return;
    const order = await db.order.findUniqueOrThrow({
      where: { id: created.orderId },
    });
    // The agreed price, not the asking price.
    expect(order.priceUsd).toBe(8_000);
    expect(order.offerId).toBe(o.offerId);
    // And the fee follows the agreed price too.
    expect(order.buyerFeeUsd).toBe(240);
    expect(order.totalUsd).toBe(8_240);
  }),
);

test(
  "nobody else can open a deal on a listing an accepted offer is holding",
  withCleanDb(async () => {
    const o = await acceptedOffer();
    const stranger = await seedUser();

    expect(
      await createDeal({
        listingId: o.listing.id,
        buyerId: stranger.id,
        mode: "FASTEST",
      }),
    ).toMatchObject({ ok: false, reason: "not-live" });
  }),
);

test(
  "one accepted offer opens one deal",
  withCleanDb(async () => {
    const o = await acceptedOffer();
    const first = await createDeal({
      listingId: o.listing.id,
      buyerId: o.buyer.id,
      mode: "FASTEST",
    });
    expect(first).toMatchObject({ ok: true });

    // The listing is held by the deal now, so a second attempt is refused
    // rather than opening another deal off the same acceptance.
    expect(
      await createDeal({
        listingId: o.listing.id,
        buyerId: o.buyer.id,
        mode: "SAFEST",
      }),
    ).toMatchObject({ ok: false });
    expect(await db.order.count({ where: { listingId: o.listing.id } })).toBe(
      1,
    );
  }),
);

test(
  "an accepted offer nobody acts on lapses, and the listing goes back on sale",
  withCleanDb(async () => {
    const o = await acceptedOffer();
    // Accepted longer ago than the payment window.
    await db.offer.update({
      where: { id: o.offerId },
      data: { respondedAt: new Date(Date.now() - 49 * 60 * 60 * 1000) },
    });

    expect(await releaseLapsedOfferReservations()).toBe(1);

    const listing = await db.listing.findUniqueOrThrow({
      where: { id: o.listing.id },
    });
    expect(listing.status).toBe("LIVE");
    const offer = await db.offer.findUniqueOrThrow({
      where: { id: o.offerId },
    });
    expect(offer.status).toBe("EXPIRED");
  }),
);

test(
  "a lapsed reservation is released on demand, so the next buyer is not refused",
  withCleanDb(async () => {
    const o = await acceptedOffer();
    await db.offer.update({
      where: { id: o.offerId },
      data: { respondedAt: new Date(Date.now() - 49 * 60 * 60 * 1000) },
    });
    const next = await seedUser();

    // No sweep has run. createDeal clears it itself.
    expect(
      await createDeal({
        listingId: o.listing.id,
        buyerId: next.id,
        mode: "FASTEST",
      }),
    ).toMatchObject({ ok: true });
  }),
);

test(
  "a fresh acceptance is not released early",
  withCleanDb(async () => {
    await acceptedOffer();
    expect(await releaseLapsedOfferReservations()).toBe(0);
  }),
);

test(
  "a reservation that became a deal is never released by the offer sweep",
  withCleanDb(async () => {
    const o = await acceptedOffer();
    await createDeal({
      listingId: o.listing.id,
      buyerId: o.buyer.id,
      mode: "FASTEST",
    });
    await db.offer.update({
      where: { id: o.offerId },
      data: { respondedAt: new Date(Date.now() - 49 * 60 * 60 * 1000) },
    });

    expect(await releaseLapsedOfferReservations()).toBe(0);
    const listing = await db.listing.findUniqueOrThrow({
      where: { id: o.listing.id },
    });
    expect(listing.status).toBe("RESERVED");
  }),
);

test(
  "buying outright closes the other open offers on the listing",
  withCleanDb(async () => {
    // A buyer waiting on an offer kept seeing "waiting on seller" on a channel
    // somebody else had already bought, for up to thirty days.
    const seeded = await seedListing({ priceUsd: 10_000 });
    const hopeful = await seedUser();
    const made = await createOffer({
      buyerId: hopeful.id,
      listingId: seeded.listing.id,
      amountCents: 7_000,
      message: null,
      expiryHours: 48,
    });
    if (!made.ok) throw new Error(made.reason);

    await createDeal({
      listingId: seeded.listing.id,
      buyerId: seeded.buyer.id,
      mode: "FASTEST",
    });

    const offer = await db.offer.findUniqueOrThrow({
      where: { id: made.value.offerId },
    });
    expect(offer.status).toBe("REJECTED");
  }),
);
