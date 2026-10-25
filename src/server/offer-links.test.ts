import { expect, test } from "vitest";
import {
  counterOffer,
  createOffer,
  getOffersForBuyer,
  getOffersForSeller,
  proposePrice,
  withdrawOffer,
} from "@/server/offers";
import { seedListing, withCleanDb } from "@/test/db";

/**
 * Each offer in the lists knows where its conversation is, so the Offers
 * page can send people to it.
 */

test(
  "each offer in the lists knows its conversation",
  withCleanDb(async () => {
    const { listing, buyer, seller } = await seedListing();
    const made = await createOffer({
      buyerId: buyer.id,
      listingId: listing.id,
      amountCents: 8_000,
      message: null,
      expiryHours: 48,
    });
    if (!made.ok) throw new Error(made.reason);
    const countered = await counterOffer({
      offerId: made.value.offerId,
      responderId: seller.id,
      as: "seller",
      amountCents: 9_000,
      message: null,
      expiryHours: 48,
    });
    if (!countered.ok) throw new Error(countered.reason);

    const [mine, theirs] = await Promise.all([
      getOffersForBuyer(buyer.id),
      getOffersForSeller(seller.id),
    ]);
    for (const row of [...mine, ...theirs]) {
      expect(row.conversationId).toBe(made.value.conversationId);
    }
    // A counter points back at what it countered.
    expect(mine.find((o) => o.id === countered.value.offerId)?.counterOf).toBe(
      made.value.offerId,
    );
  }),
);

test(
  "a seller's own price is not a counter",
  withCleanDb(async () => {
    const { listing, buyer, seller } = await seedListing();
    const made = await createOffer({
      buyerId: buyer.id,
      listingId: listing.id,
      amountCents: 8_000,
      message: null,
      expiryHours: 48,
    });
    if (!made.ok) throw new Error(made.reason);
    // Withdrawn, so the seller can put their own price instead.
    await withdrawOffer(made.value.offerId, buyer.id);
    const price = await proposePrice({
      sellerId: seller.id,
      conversationId: made.value.conversationId,
      listingId: listing.id,
      amountCents: 9_000,
      message: null,
      expiryHours: 48,
    });
    if (!price.ok) throw new Error(price.reason);

    const row = (await getOffersForBuyer(buyer.id)).find(
      (o) => o.id === price.value.offerId,
    );
    expect(row).toMatchObject({ bySeller: true, counterOf: null });
  }),
);
