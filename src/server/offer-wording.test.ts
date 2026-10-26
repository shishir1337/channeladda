import { beforeEach, expect, test, vi } from "vitest";
import { db } from "@/lib/db";
import {
  acceptOffer,
  counterOffer,
  createOffer,
  declineOffer,
  heldByAcceptedOffer,
  withdrawOffer,
} from "@/server/offers";
import { seedListing, withCleanDb } from "@/test/db";

/**
 * Each side of an offer is told what happened in its own words. QA: a
 * buyer turning down the seller's price sent the seller "Your offer of
 * $2,400.00 was turned down", and a seller taking back their own price told
 * the buyer they had "withdrawn their offer".
 */

vi.mock("@/server/mailer", () => ({
  canSendMail: () => false,
  sendMail: async () => {},
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// The seeded listing asks $100.
async function sellerCounter() {
  const seeded = await seedListing();
  const made = await createOffer({
    buyerId: seeded.buyer.id,
    listingId: seeded.listing.id,
    amountCents: 8_000,
    message: null,
    expiryHours: 48,
  });
  if (!made.ok) throw new Error(made.reason);
  const counter = await counterOffer({
    offerId: made.value.offerId,
    responderId: seeded.seller.id,
    as: "seller",
    amountCents: 9_000,
    message: null,
    expiryHours: 48,
  });
  if (!counter.ok) throw new Error(counter.reason);
  await db.notification.deleteMany();
  return {
    ...seeded,
    offerId: made.value.offerId,
    counterId: counter.value.offerId,
  };
}

const toldTo = (userId: string) =>
  db.notification.findMany({ where: { userId } });

test(
  "a buyer turning down the seller's price tells the seller whose price it was",
  withCleanDb(async () => {
    const { buyer, seller, counterId } = await sellerCounter();

    expect((await declineOffer(counterId, buyer.id, "buyer")).ok).toBe(true);

    const [told] = await toldTo(seller.id);
    expect(told.title).toBe(`${buyer.name} turned down your price of $90.00`);
    expect(told.title).not.toMatch(/your offer/i);
    expect(await db.notification.count({ where: { userId: buyer.id } })).toBe(
      0,
    );
  }),
);

test(
  "a seller turning down the buyer's offer still tells the buyer it was theirs",
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
    await db.notification.deleteMany();

    expect(
      (await declineOffer(made.value.offerId, seller.id, "seller")).ok,
    ).toBe(true);

    const [told] = await toldTo(buyer.id);
    expect(told.title).toBe("Your offer of $80.00 was turned down");
  }),
);

test(
  "a seller withdrawing their price tells the buyer it was a price",
  withCleanDb(async () => {
    const { buyer, seller, counterId } = await sellerCounter();

    expect((await withdrawOffer(counterId, seller.id)).ok).toBe(true);

    const [told] = await toldTo(buyer.id);
    expect(told.title).toBe(`${seller.name} withdrew their price of $90.00`);
    expect(told.title).not.toMatch(/offer/i);
  }),
);

test(
  "a buyer withdrawing their offer tells the seller it was an offer",
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
    await db.notification.deleteMany();

    expect((await withdrawOffer(made.value.offerId, buyer.id)).ok).toBe(true);

    const [told] = await toldTo(seller.id);
    expect(told.title).toBe(`${buyer.name} withdrew their offer of $80.00`);
  }),
);

test(
  "the hold says who agreed: the buyer accepting the seller's price, or the seller the buyer's offer",
  withCleanDb(async () => {
    // The listing page told a buyer who had accepted the seller's counter
    // that "the seller accepted your offer".
    const { listing, buyer, counterId } = await sellerCounter();
    expect((await acceptOffer(counterId, buyer.id, "buyer")).ok).toBe(true);

    const held = await heldByAcceptedOffer(listing.id, buyer.id);
    expect(held).toMatchObject({ amountUsd: 9_000, bySeller: true });
  }),
);
