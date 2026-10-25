import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { getSeller, getSellers } from "@/server/sellers";
import { seedListing, withCleanDb } from "@/test/db";

// The Verified badge's note names the ID and the citizenship from the
// approved check, on the seller's page and in the list alike.

async function approvedWith(
  documentType: "PASSPORT" | "AADHAAR" | null,
  status: "APPROVED" | "PENDING" = "APPROVED",
) {
  const { seller } = await seedListing();
  if (documentType) {
    await db.kycSubmission.create({
      data: {
        userId: seller.id,
        status,
        documentType,
        documentUrl: `/uploads/kyc/${"a".repeat(32)}.png`,
        fullName: "Test Seller",
        country: "India",
      },
    });
  }
  return seller;
}

test(
  "an approved check gives the badge its ID and citizenship",
  withCleanDb(async () => {
    const seller = await approvedWith("PASSPORT");
    expect((await getSeller(seller.slug ?? ""))?.verifiedWith).toEqual({
      document: "PASSPORT",
      country: "India",
    });
    const listed = (await getSellers()).find((s) => s.slug === seller.slug);
    expect(listed?.verifiedWith).toEqual({
      document: "PASSPORT",
      country: "India",
    });
  }),
);

test(
  "a badge approved by hand, with nothing on file, names nothing",
  withCleanDb(async () => {
    const seller = await approvedWith(null);
    const page = await getSeller(seller.slug ?? "");
    expect(page?.verified).toBe(true);
    expect(page?.verifiedWith).toBeNull();
  }),
);

test(
  "a check still waiting names nothing",
  withCleanDb(async () => {
    const seller = await approvedWith("AADHAAR", "PENDING");
    expect((await getSeller(seller.slug ?? ""))?.verifiedWith).toBeNull();
  }),
);
