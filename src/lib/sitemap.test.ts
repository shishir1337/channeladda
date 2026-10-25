import { describe, expect, it } from "vitest";
import { helpArticles } from "@/data/help";
import { parseLongDate, sitemapEntries } from "@/lib/sitemap";

const base = "https://channeladda.test";
const entries = sitemapEntries({
  base,
  listings: [
    {
      slug: "nomad-lens-instagram",
      updatedAt: new Date("2026-10-20T10:00:00Z"),
    },
  ],
  sellers: [
    { slug: "rehan-malik", updatedAt: new Date("2026-10-01T00:00:00Z") },
  ],
});
const urls = entries.map((e) => e.url);

describe("the sitemap", () => {
  it("lists all five platform pages", () => {
    for (const id of [
      "youtube",
      "instagram",
      "facebook",
      "telegram",
      "website",
    ]) {
      expect(urls).toContain(`${base}/browse/${id}`);
    }
  });

  it("lists every help article", () => {
    expect(helpArticles).toHaveLength(11);
    for (const article of helpArticles) {
      expect(urls).toContain(`${base}/help/${article.slug}`);
    }
  });

  it("dates listings, sellers and policies by when they last changed", () => {
    const at = (url: string) =>
      entries.find((e) => e.url === url)?.lastModified;
    expect(at(`${base}/listing/nomad-lens-instagram`)).toEqual(
      new Date("2026-10-20T10:00:00Z"),
    );
    expect(at(`${base}/seller/rehan-malik`)).toEqual(
      new Date("2026-10-01T00:00:00Z"),
    );
    expect(at(`${base}/terms`)).toBeInstanceOf(Date);
    // A page with no date says nothing rather than today.
    expect(at(`${base}/browse`)).toBeUndefined();
  });

  it("names each page once", () => {
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("leaves out accounts, staff desks and sign-in", () => {
    expect(urls.some((u) => /\/(dashboard|admin|signin|signup)/.test(u))).toBe(
      false,
    );
  });
});

describe("parseLongDate", () => {
  it("reads the policies' dates, and nothing else", () => {
    expect(parseLongDate("26 October 2026")).toEqual(
      new Date(Date.UTC(2026, 9, 26)),
    );
    expect(parseLongDate("Octember 3 2026")).toBeNull();
    expect(parseLongDate("soon")).toBeNull();
  });
});
