import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { getProofCount } from "@/server/listings";
import { seedListing, withCleanDb } from "@/test/db";

// Only the count is public. A caption was written for a moderator — the
// form asks for "the account settings page", which can carry an owner's
// email — so it never reaches a visitor.

test(
  "a listing's proof is counted from what its seller uploaded",
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
        },
        {
          listingId: listing.id,
          url: "/uploads/proof/b.png",
          label: "Account settings, owner@example.test",
          fileHash: "b",
        },
        {
          listingId: other.listing.id,
          url: "/uploads/proof/c.png",
          label: "Someone else's screenshot",
          fileHash: "c",
        },
      ],
    });

    expect(await getProofCount(listing.id)).toBe(2);
  }),
);

test(
  "a listing with no proof has none, rather than sample artwork",
  withCleanDb(async () => {
    const { listing } = await seedListing();
    expect(await getProofCount(listing.id)).toBe(0);
  }),
);
