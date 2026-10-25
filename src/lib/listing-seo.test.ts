import { describe, expect, it } from "vitest";
import type { Listing } from "@/data/listings";
import { platformMap } from "@/data/platforms";
import { listingDescription, listingLd, previewImage } from "@/lib/listing-seo";

const listing: Listing = {
  id: "l1",
  slug: "nomad-lens-instagram",
  platform: "instagram",
  handle: "@nomad.lens",
  title: "Travel photography page with a loyal audience",
  audience: 2_140_000,
  monetized: false,
  monthlyRevenue: 0,
  niche: "Travel",
  country: "India",
  engagement: 4.2,
  ageYears: 5,
  price: 12_500,
  ownershipVerified: true,
  coverUrl: "/media/covers/ig-3345.svg",
  avatarUrl: "/media/avatars/ig-3345.svg",
  sellerSlug: "rehan-malik",
  sellerName: "Rehan Malik",
  sellerPoints: 0,
  sellerSales: 3,
  channel: null,
  watching: 4,
  listedDaysAgo: 2,
};

describe("listingDescription", () => {
  it("says what the account is, who follows it and what it costs", () => {
    const text = listingDescription(listing, platformMap.instagram);
    expect(text).toBe(
      "Travel photography page with a loyal audience. Instagram page in Travel with 2.14M followers, mostly in India. Asking $12,500.00, ownership verified.",
    );
    expect(text.length).toBeLessThanOrEqual(160);
  });

  it("is never longer than a search result shows, whatever the seller wrote", () => {
    const text = listingDescription(
      {
        ...listing,
        title:
          "A very long seller headline that goes on about the audience and the niche for a while",
        country: "Global",
      },
      platformMap.instagram,
    );
    expect(text.length).toBeLessThanOrEqual(160);
    expect(text).toContain("worldwide.");
  });

  it("calls a website a website and a sold listing sold", () => {
    const text = listingDescription(
      { ...listing, platform: "website", title: "Finance blog" },
      platformMap.website,
      true,
    );
    expect(text).toContain("Website in Travel");
    expect(text).toContain("Sold on Channel Adda.");
    expect(text).not.toContain("Asking");
  });
});

describe("listingDescription figures", () => {
  it("leaves out an engagement rate nobody gave", () => {
    const text = listingDescription(
      { ...listing, title: "Food", engagement: 0 },
      platformMap.instagram,
    );
    expect(text).not.toContain("0% engagement");
    expect(text).toContain("5 years old, not monetized.");
  });
});

describe("listingLd", () => {
  it("is a product with one offer at the asking price, and its breadcrumbs", () => {
    const [product, crumbs] = listingLd(
      "https://x.test",
      listing,
      platformMap.instagram,
    );
    expect(product).toMatchObject({
      "@type": "Product",
      name: "@nomad.lens — Instagram page",
      url: "https://x.test/listing/nomad-lens-instagram",
      category: "Instagram pages",
      offers: {
        "@type": "Offer",
        price: "12500.00",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        seller: { "@type": "Person", name: "Rehan Malik" },
      },
    });
    // The sample artwork is SVG, which no preview or rich result shows.
    expect(product).not.toHaveProperty("image");
    expect(crumbs.itemListElement.map((c) => c.name)).toEqual([
      "Home",
      "Browse",
      "Instagram pages",
      "@nomad.lens",
    ]);
  });

  it("carries an uploaded cover, and says when the account is gone", () => {
    const cover = `/uploads/cover/${"d".repeat(32)}.jpg`;
    const [product] = listingLd(
      "https://x.test",
      { ...listing, coverUrl: cover },
      platformMap.instagram,
      { sold: true },
    );
    expect(product).toMatchObject({
      image: `https://x.test${cover}`,
      offers: { availability: "https://schema.org/SoldOut" },
    });
  });
});

describe("previewImage", () => {
  it("only offers a picture a link preview can show", () => {
    expect(previewImage("/media/covers/x.svg")).toBeNull();
    expect(previewImage("/uploads/cover/a.png")).toBe("/uploads/cover/a.png");
  });
});
