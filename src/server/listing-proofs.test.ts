import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { getProofLabels } from "@/server/listings";
import { seedListing, withCleanDb } from "@/test/db";

test(
  "a listing's proof is what its seller uploaded, in the order they uploaded it",
  withCleanDb(async () => {
    const { listing } = await seedListing();
    const other = await seedListing();
    await db.listingProof.createMany({
      data: [
        {
          listingId: listing.id,
          url: "/uploads/proof/a.png",
          label: "Studio analytics, last 90 days",
          fileHash: "a",
          uploadedAt: new Date("2026-10-01T10:00:00Z"),
        },
        {
          listingId: listing.id,
          url: "/uploads/proof/b.png",
          label: "AdSense payouts, 2026",
          fileHash: "b",
          uploadedAt: new Date("2026-10-01T10:05:00Z"),
        },
        {
          listingId: other.listing.id,
          url: "/uploads/proof/c.png",
          label: "Someone else's screenshot",
          fileHash: "c",
        },
      ],
    });

    expect(await getProofLabels(listing.id)).toEqual([
      "Studio analytics, last 90 days",
      "AdSense payouts, 2026",
    ]);
  }),
);

test(
  "a listing with no proof has none, rather than sample artwork",
  withCleanDb(async () => {
    const { listing } = await seedListing();
    expect(await getProofLabels(listing.id)).toEqual([]);
  }),
);
