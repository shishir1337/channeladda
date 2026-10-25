import { beforeEach, expect, test, vi } from "vitest";
import { db } from "@/lib/db";
import {
  acceptOffer,
  counterOffer,
  createOffer,
  openOfferOn,
} from "@/server/offers";
import { seedListing, withCleanDb } from "@/test/db";

/**
 * The amounts an offer may carry, enforced where it is stored, and the
 * words each side reads when one is accepted.
 */

vi.mock("@/server/mailer", () => ({
  canSendMail: () => false,
  sendMail: async () => {},
}));

// The seeded listing asks $100.
const offer = (listingId: string, buyerId: string, amountCents: number) =>
  createOffer({
    buyerId,
    listingId,
    amountCents,
    message: null,
    expiryHours: 48,
  });

const counter = (
  offerId: string,
  responderId: string,
  as: "buyer" | "seller",
  amountCents: number,
) =>
  counterOffer({
    offerId,
    responderId,
    as,
    amountCents,
    message: null,
    expiryHours: 48,
  });

beforeEach(() => {
  vi.useRealTimers();
});

test(
  "an offer at or above the asking price is refused",
  withCleanDb(async () => {
    const { listing, buyer } = await seedListing();
    expect(await offer(listing.id, buyer.id, 10_000)).toEqual({
      ok: false,
      reason: "at-asking",
    });
    // QA: $9,000 on a $900 listing went through as "1000% of asking".
    expect(await offer(listing.id, buyer.id, 100_000)).toEqual({
      ok: false,
      reason: "at-asking",
    });
    expect(await db.offer.count()).toBe(0);
    expect((await offer(listing.id, buyer.id, 9_999)).ok).toBe(true);
  }),
);

test(
  "a seller's counter must beat the buyer's offer and stay within the asking price",
  withCleanDb(async () => {
    const { listing, buyer, seller } = await seedListing();
    const made = await offer(listing.id, buyer.id, 7_000);
    if (!made.ok) throw new Error(made.reason);

    // QA: the buyer offered $700 and the seller countered $650.
    expect(
      await counter(made.value.offerId, seller.id, "seller", 6_500),
    ).toEqual({ ok: false, reason: "counter-not-higher" });
    expect(
      await counter(made.value.offerId, seller.id, "seller", 7_000),
    ).toEqual({ ok: false, reason: "counter-not-higher" });
    expect(
      await counter(made.value.offerId, seller.id, "seller", 10_001),
    ).toEqual({ ok: false, reason: "above-asking" });
    // Refusals leave the buyer's offer open to answer.
    expect(
      (await db.offer.findUniqueOrThrow({ where: { id: made.value.offerId } }))
        .status,
    ).toBe("OPEN");

    // The asking price itself is a fair answer: no discount.
    expect(
      (await counter(made.value.offerId, seller.id, "seller", 10_000)).ok,
    ).toBe(true);
  }),
);

test(
  "a buyer's counter must be below the seller's price",
  withCleanDb(async () => {
    const { listing, buyer, seller } = await seedListing();
    const made = await offer(listing.id, buyer.id, 7_000);
    if (!made.ok) throw new Error(made.reason);
    const theirs = await counter(
      made.value.offerId,
      seller.id,
      "seller",
      9_000,
    );
    if (!theirs.ok) throw new Error(theirs.reason);

    expect(
      await counter(theirs.value.offerId, buyer.id, "buyer", 9_000),
    ).toEqual({ ok: false, reason: "counter-not-lower" });
    expect(
      (await counter(theirs.value.offerId, buyer.id, "buyer", 8_000)).ok,
    ).toBe(true);
  }),
);

test(
  "the buyer is told the listing is held for them",
  withCleanDb(async () => {
    const { listing, buyer, seller } = await seedListing();
    const made = await offer(listing.id, buyer.id, 8_000);
    if (!made.ok) throw new Error(made.reason);
    await db.notification.deleteMany();

    expect(
      (await acceptOffer(made.value.offerId, seller.id, "seller")).ok,
    ).toBe(true);

    const [told] = await db.notification.findMany({
      where: { userId: buyer.id },
    });
    expect(told.title).toBe("Your offer of $80.00 was accepted");
    expect(told.body).toMatch(/held for you until .+ UTC/);
    // The seller pressed the button; nothing for them to be told.
    expect(await db.notification.count({ where: { userId: seller.id } })).toBe(
      0,
    );
  }),
);

test(
  "the seller whose price is accepted is told who it is held for",
  withCleanDb(async () => {
    // QA: the buyer accepted the seller's counter and the seller read the
    // buyer's words — "Your offer was accepted. The listing is held for you."
    const { listing, buyer, seller } = await seedListing();
    const made = await offer(listing.id, buyer.id, 8_000);
    if (!made.ok) throw new Error(made.reason);
    const theirs = await counter(
      made.value.offerId,
      seller.id,
      "seller",
      9_000,
    );
    if (!theirs.ok) throw new Error(theirs.reason);
    await db.notification.deleteMany();

    expect(
      (await acceptOffer(theirs.value.offerId, buyer.id, "buyer")).ok,
    ).toBe(true);

    const [told] = await db.notification.findMany({
      where: { userId: seller.id },
    });
    expect(told.title).toBe(`${buyer.name} accepted your price of $90.00`);
    expect(told.body).toContain(`held for ${buyer.name} until`);
    expect(told.body).not.toMatch(/held for you/);
    expect(await db.notification.count({ where: { userId: buyer.id } })).toBe(
      0,
    );
  }),
);

test(
  "the buyer's open offer on a listing can be found for the listing page",
  withCleanDb(async () => {
    const { listing, buyer, seller } = await seedListing();
    expect(await openOfferOn(listing.id, buyer.id)).toBeNull();

    const made = await offer(listing.id, buyer.id, 8_000);
    if (!made.ok) throw new Error(made.reason);
    expect(await openOfferOn(listing.id, buyer.id)).toMatchObject({
      id: made.value.offerId,
      amount: 80,
      awaiting: "seller",
      conversationId: made.value.conversationId,
    });

    // The seller's counter is the open one now, and it is the buyer's move.
    const theirs = await counter(
      made.value.offerId,
      seller.id,
      "seller",
      9_000,
    );
    if (!theirs.ok) throw new Error(theirs.reason);
    expect(await openOfferOn(listing.id, buyer.id)).toMatchObject({
      id: theirs.value.offerId,
      amount: 90,
      awaiting: "buyer",
    });

    // Lapsed is not open.
    await db.offer.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await openOfferOn(listing.id, buyer.id)).toBeNull();
  }),
);
