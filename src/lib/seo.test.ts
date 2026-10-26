import { describe, expect, it } from "vitest";
import { platforms } from "@/data/platforms";
import {
  breadcrumbLd,
  clampDescription,
  DEFAULT_OG_IMAGE,
  DESCRIPTION_MAX,
  jsonLdText,
  pagedPath,
  pagedTitle,
  pageMetadata,
  SITE_DESCRIPTION,
  SITE_TITLE,
  siteLd,
} from "@/lib/seo";

describe("clampDescription", () => {
  it("leaves a description that fits alone, tidying its spaces", () => {
    expect(clampDescription("  Buy a  channel.  ")).toBe("Buy a channel.");
  });

  it("keeps whole sentences while they fit", () => {
    const text = `${"a".repeat(100)}. ${"b".repeat(40)}. ${"c".repeat(40)}.`;
    expect(clampDescription(text)).toBe(
      `${"a".repeat(100)}. ${"b".repeat(40)}.`,
    );
  });

  it("cuts one long sentence at a word, with an ellipsis", () => {
    const text = `${"word ".repeat(60).trim()}.`;
    const clamped = clampDescription(text);
    expect(clamped.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(clamped.endsWith("word…")).toBe(true);
  });
});

describe("pageMetadata", () => {
  it("gives every page a canonical address, an og:url and the same text in previews", () => {
    const metadata = pageMetadata({
      title: "Help centre",
      description: "Guides on how a deal is protected.",
      path: "/help",
    });
    expect(metadata.alternates).toEqual({ canonical: "/help" });
    expect(metadata.openGraph).toMatchObject({
      url: "/help",
      title: "Help centre | Channel Adda",
      description: "Guides on how a deal is protected.",
      siteName: "Channel Adda",
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      images: ["/opengraph-image"],
    });
    // Without a picture of its own the page shows the site's.
    expect(metadata.openGraph).toMatchObject({ images: [DEFAULT_OG_IMAGE] });
  });

  it("shows a page's own picture instead of the site's", () => {
    const metadata = pageMetadata({
      title: "@x",
      description: "A listing.",
      path: "/listing/x",
      images: [{ url: "/uploads/cover/a.png", alt: "@x" }],
    });
    expect(metadata.openGraph).toMatchObject({
      images: [{ url: "/uploads/cover/a.png", alt: "@x" }],
    });
  });

  it("uses an absolute title as it is", () => {
    const metadata = pageMetadata({
      title: { absolute: "Channel Adda — Buy & sell" },
      description: SITE_DESCRIPTION,
      path: "/",
    });
    expect(metadata.openGraph).toMatchObject({
      title: "Channel Adda — Buy & sell",
    });
  });

  it("never sends a description longer than a search result shows", () => {
    const metadata = pageMetadata({
      title: "x",
      description: `${"Long sentence here ".repeat(20)}.`,
      path: "/x",
    });
    expect(String(metadata.description).length).toBeLessThanOrEqual(160);
  });
});

describe("the home page in search", () => {
  it("leads with what people search for, and the name", () => {
    // The owner's first search: "YouTube channel buy sell", in that order.
    expect(SITE_TITLE).toMatch(/^YouTube Channel Buy and Sell /);
    expect(SITE_TITLE).toContain("Channel Adda");
    expect(SITE_TITLE.length).toBeLessThanOrEqual(60);
    expect(SITE_DESCRIPTION).toMatch(/^YouTube channel buy and sell/);
    expect(SITE_DESCRIPTION).toContain(
      "buy or sell monetized YouTube channels",
    );
  });

  it("gives the name the ways people write it, for a search of it", () => {
    const [organization, website] = siteLd("https://channeladda.test", "x");
    for (const thing of [organization, website]) {
      expect(thing.alternateName).toEqual(
        expect.arrayContaining(["ChannelAdda", "channeladda.com"]),
      );
    }
  });
});

describe("descriptions written for search", () => {
  it("fit in 160 characters: the site's and every platform page's", () => {
    expect(SITE_DESCRIPTION.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    for (const p of platforms) {
      expect(p.summary.length, p.id).toBeLessThanOrEqual(DESCRIPTION_MAX);
      // "Page 7." is put in front of them on later pages.
      expect(p.summary.length + 9, p.id).toBeLessThanOrEqual(DESCRIPTION_MAX);
    }
  });
});

describe("paged lists", () => {
  it("names the page after the first, and keeps only the page in its address", () => {
    expect(pagedTitle("Browse accounts for sale", 1)).toBe(
      "Browse accounts for sale",
    );
    expect(pagedTitle("Browse accounts for sale", 3)).toBe(
      "Browse accounts for sale · Page 3",
    );
    expect(pagedPath("/browse", 1)).toBe("/browse");
    expect(pagedPath("/browse/youtube", 2)).toBe("/browse/youtube?page=2");
  });
});

describe("structured data", () => {
  it("cannot be closed early by text inside it", () => {
    const text = jsonLdText({ name: "</script><script>alert(1)</script>" });
    expect(text).not.toContain("<");
    expect(JSON.parse(text)).toEqual({
      name: "</script><script>alert(1)</script>",
    });
  });

  it("describes the site and who runs it", () => {
    const [organization, website] = siteLd("https://channeladda.test", "x");
    expect(organization).toMatchObject({
      "@type": "Organization",
      name: "Channel Adda",
      url: "https://channeladda.test/",
      logo: "https://channeladda.test/email/mark.png",
    });
    expect(website).toMatchObject({
      "@type": "WebSite",
      publisher: { "@id": "https://channeladda.test/#organization" },
    });
  });

  it("numbers breadcrumbs from one, with full addresses", () => {
    expect(
      breadcrumbLd("https://x.test", [
        { name: "Home", path: "/" },
        { name: "Browse", path: "/browse" },
      ]).itemListElement,
    ).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://x.test/",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Browse",
        item: "https://x.test/browse",
      },
    ]);
  });
});

describe("clampDescription and figures", () => {
  it("does not take a decimal point for the end of a sentence", () => {
    const text = `Instagram page with 2.14M followers. Asking $12,500.00. ${"x".repeat(150)}.`;
    expect(clampDescription(text)).toBe(
      "Instagram page with 2.14M followers. Asking $12,500.00.",
    );
  });
});

describe("clampDescription with a short first sentence", () => {
  it("fills the room at a word rather than stopping at one short line", () => {
    const text = `Opening a dispute. ${"When a handover goes wrong you open one from the deal page and a moderator reads the whole record ".repeat(2)}.`;
    const clamped = clampDescription(text);
    expect(clamped.startsWith("Opening a dispute. When a handover")).toBe(true);
    expect(clamped.endsWith("…")).toBe(true);
    expect(clamped.length).toBeGreaterThan(120);
    expect(clamped.length).toBeLessThanOrEqual(160);
  });
});
