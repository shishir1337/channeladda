import { expect, test } from "vitest";
import type { OfferStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { expireOffers } from "@/server/offers";
import { seedListing, withCleanDb } from "@/test/db";

async function offer(hoursFromNow: number, status: OfferStatus = "OPEN") {
  const { listing, buyer } = await seedListing();
  return db.offer.create({
    data: {
      listingId: listing.id,
      buyerId: buyer.id,
      amountUsd: 8_000,
      status,
      expiresAt: new Date(Date.now() + hoursFromNow * 3_600_000),
    },
  });
}

test(
  "a lapsed offer is written down as expired",
  withCleanDb(async () => {
    const stale = await offer(-1);
    expect(await expireOffers()).toBe(1);

    const after = await db.offer.findUniqueOrThrow({
      where: { id: stale.id },
    });
    expect(after.status).toBe("EXPIRED");
    // Nobody answered: the clock ran out. Stamping respondedAt here made a
    // lapsed offer indistinguishable from a rejected one in the history,
    // which is the one thing the column is for.
    expect(after.respondedAt).toBeNull();
  }),
);

test(
  "an offer still inside its window is left alone",
  withCleanDb(async () => {
    const live = await offer(12);
    expect(await expireOffers()).toBe(0);
    expect(
      (await db.offer.findUniqueOrThrow({ where: { id: live.id } })).status,
    ).toBe("OPEN");
  }),
);

test(
  "an answered offer is not reopened or re-stamped",
  withCleanDb(async () => {
    // An accepted offer whose window has since passed must stay accepted.
    const accepted = await offer(-5, "ACCEPTED");
    expect(await expireOffers()).toBe(0);
    expect(
      (await db.offer.findUniqueOrThrow({ where: { id: accepted.id } })).status,
    ).toBe("ACCEPTED");
  }),
);

test(
  "sweeping twice changes nothing the second time",
  withCleanDb(async () => {
    await offer(-1);
    expect(await expireOffers()).toBe(1);
    expect(await expireOffers()).toBe(0);
  }),
);

test(
  "two concurrent sweeps expire each offer once between them",
  withCleanDb(async () => {
    await offer(-1);
    await offer(-2);
    const [a, b] = await Promise.all([expireOffers(), expireOffers()]);
    expect(a + b).toBe(2);
  }),
);
