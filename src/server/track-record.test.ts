import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import type { DealMode, OrderStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { trackRecord } from "@/server/track-record";
import { seedListing, seedUser, withCleanDb } from "@/test/db";

// Before agreeing a deal, each side wants to know who they are dealing with:
// how many deals the other has finished here and for how much. Only deals
// that completed count, on either side of the table.

async function order(input: {
  listingId: string;
  buyerId: string;
  sellerId: string;
  mode: DealMode;
  status: OrderStatus;
  priceCents: number;
}) {
  return db.order.create({
    data: {
      reference: `CA-${randomUUID().slice(0, 8)}`,
      listingId: input.listingId,
      buyerId: input.buyerId,
      sellerId: input.sellerId,
      mode: input.mode,
      status: input.status,
      priceUsd: input.priceCents,
      buyerFeeUsd: 0,
      sellerFeeUsd: 0,
      totalUsd: input.priceCents,
    },
  });
}

test(
  "completed deals count on both sides, split by mode",
  withCleanDb(async () => {
    const { listing, seller, buyer } = await seedListing();
    const other = await seedUser();
    const common = { listingId: listing.id, sellerId: seller.id };

    await order({
      ...common,
      buyerId: buyer.id,
      mode: "SAFEST",
      status: "COMPLETED",
      priceCents: 1_000_000,
    });
    await order({
      ...common,
      buyerId: other.id,
      mode: "FASTEST",
      status: "COMPLETED",
      priceCents: 250_000,
    });
    await order({
      ...common,
      buyerId: other.id,
      mode: "SAFEST",
      status: "COMPLETED",
      priceCents: 500_000,
    });

    expect(await trackRecord(seller.id)).toEqual({
      deals: 3,
      worthCents: 1_750_000,
      safest: { deals: 2, worthCents: 1_500_000 },
      fastest: { deals: 1, worthCents: 250_000 },
      asBuyer: 0,
      asSeller: 3,
    });
    expect(await trackRecord(buyer.id)).toMatchObject({
      deals: 1,
      worthCents: 1_000_000,
      asBuyer: 1,
      asSeller: 0,
    });
  }),
);

test(
  "a deal still running, refunded or cancelled is not a track record",
  withCleanDb(async () => {
    const { listing, seller, buyer } = await seedListing();
    const common = {
      listingId: listing.id,
      sellerId: seller.id,
      buyerId: buyer.id,
    };
    for (const status of [
      "AWAITING_PAYMENT",
      "IN_CUSTODY",
      "REFUNDED",
      "CANCELLED",
      "DISPUTED",
    ] as const) {
      await order({ ...common, mode: "SAFEST", status, priceCents: 900_000 });
    }
    expect(await trackRecord(seller.id)).toMatchObject({
      deals: 0,
      worthCents: 0,
    });
  }),
);

test(
  "somebody who has never dealt has a record of nothing, not an error",
  withCleanDb(async () => {
    const nobody = await seedUser();
    expect(await trackRecord(nobody.id)).toEqual({
      deals: 0,
      worthCents: 0,
      safest: { deals: 0, worthCents: 0 },
      fastest: { deals: 0, worthCents: 0 },
      asBuyer: 0,
      asSeller: 0,
    });
  }),
);
