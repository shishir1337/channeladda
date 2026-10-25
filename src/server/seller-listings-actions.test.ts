import { beforeEach, expect, test, vi } from "vitest";
import { db } from "@/lib/db";
import type { ListingLiveEditInput } from "@/lib/listing-form";
import { seedListing, withCleanDb } from "@/test/db";

/**
 * The seller's live-edit and remove actions: what reaches the server from
 * the form, what the seller is told, and which public pages are refreshed.
 * The rules themselves are pinned in seller-listings-live.test.ts.
 */

const fake = vi.hoisted(() => ({
  user: { id: "", slug: null as string | null },
  revalidated: [] as string[],
}));

vi.mock("@/server/session", () => ({
  requireUser: async () => ({
    id: fake.user.id,
    slug: fake.user.slug,
    role: "USER",
    emailVerified: true,
  }),
}));
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => {
    fake.revalidated.push(path);
  },
}));

beforeEach(() => {
  fake.revalidated = [];
});

const FORM: ListingLiveEditInput = {
  title: "Test channel",
  niche: "Tech",
  country: "Global",
  audience: 120_000,
  monetized: true,
  monthlyRevenue: 900,
  yearlyRevenue: 0,
  engagement: 7.4,
  ageYears: 3,
  price: 100,
  coverUrl: "/uploads/test-cover.png",
  avatarUrl: "/uploads/test-avatar.png",
  transferProfile: "",
  description: "",
  whatsapp: "",
};

test(
  "a live edit is checked like a submission, and refreshes the pages buyers read",
  withCleanDb(async () => {
    const { listing, seller } = await seedListing();
    fake.user = { id: seller.id, slug: seller.slug };
    const { saveLiveListing } = await import("@/server/actions/listings");

    // A live listing cannot lose its price or its cover.
    const refused = await saveLiveListing(listing.id, {
      ...FORM,
      price: 0,
      coverUrl: "",
    });
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(Object.keys(refused.errors).sort()).toEqual(["coverUrl", "price"]);

    const saved = await saveLiveListing(listing.id, { ...FORM, price: 75 });
    expect(saved).toEqual({ ok: true, id: listing.id });
    expect(fake.revalidated).toEqual(
      expect.arrayContaining([
        `/dashboard/listings/${listing.id}`,
        `/listing/${listing.slug}`,
        "/browse",
        "/",
        `/seller/${seller.slug}`,
      ]),
    );
    expect(
      (await db.listing.findUniqueOrThrow({ where: { id: listing.id } }))
        .priceUsd,
    ).toBe(7_500);
  }),
);

test(
  "a changed handle is refused in words, not dropped",
  withCleanDb(async () => {
    const { listing, seller } = await seedListing();
    fake.user = { id: seller.id, slug: seller.slug };
    const { saveLiveListing } = await import("@/server/actions/listings");

    const result = await saveLiveListing(listing.id, {
      ...FORM,
      handle: "@another-channel",
    });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).toMatch(/cannot change on a live listing/);
  }),
);

test(
  "removing refreshes the public pages, and a refusal says why",
  withCleanDb(async () => {
    const reserved = await seedListing({ listingStatus: "RESERVED" });
    fake.user = { id: reserved.seller.id, slug: reserved.seller.slug };
    const { removeListing } = await import("@/server/actions/listings");

    const refused = await removeListing(reserved.listing.id);
    expect(refused.ok).toBe(false);
    expect(JSON.stringify(refused)).toMatch(/once that deal ends/);

    const live = await seedListing();
    fake.user = { id: live.seller.id, slug: live.seller.slug };
    expect(await removeListing(live.listing.id)).toEqual({ ok: true });
    expect(fake.revalidated).toEqual(
      expect.arrayContaining([`/listing/${live.listing.slug}`, "/browse"]),
    );
  }),
);
