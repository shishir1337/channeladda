import { describe, expect, it } from "vitest";
import { guides } from "@/data/guides";
import { guideWords, splitLinks } from "@/lib/guide-text";
import { parseLongDate, sitemapEntries } from "@/lib/sitemap";

const base = "https://channeladda.test";
/** Every public page there is: a guide may link to these and nothing else. */
const pages = new Set(
  sitemapEntries({ base, listings: [], sellers: [] }).map((entry) =>
    entry.url.slice(base.length),
  ),
);

/** Every piece of a guide's text, with where it sits for a failure message. */
function texts(guide: (typeof guides)[number]): string[] {
  return [
    ...guide.intro,
    ...guide.sections.flatMap((section) => [
      section.heading,
      ...section.blocks.flatMap((block) =>
        block.kind === "p" ? [block.text] : block.items,
      ),
    ]),
    ...guide.faqs.flatMap((faq) => [faq.question, faq.answer]),
  ];
}

describe("the guides", () => {
  it("have one address each", () => {
    const slugs = guides.map((guide) => guide.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("fit a search result: the title in a line, the description in two", () => {
    for (const guide of guides) {
      expect(guide.metaTitle.length, guide.slug).toBeLessThanOrEqual(50);
      expect(guide.description.length, guide.slug).toBeGreaterThanOrEqual(120);
      expect(guide.description.length, guide.slug).toBeLessThanOrEqual(160);
      expect(parseLongDate(guide.updated), guide.slug).not.toBeNull();
    }
  });

  it("are long enough to answer the question properly", () => {
    for (const guide of guides) {
      expect(guideWords(guide), guide.slug).toBeGreaterThanOrEqual(1200);
      expect(guide.sections.length, guide.slug).toBeGreaterThanOrEqual(5);
      expect(guide.faqs.length, guide.slug).toBeGreaterThanOrEqual(4);
    }
  });

  it("link only to pages that exist", () => {
    for (const guide of guides) {
      const hrefs = [
        ...texts(guide).flatMap((text) =>
          splitLinks(text).flatMap((piece) =>
            piece.kind === "link" ? [piece.href] : [],
          ),
        ),
        ...guide.links.map((link) => link.href),
      ];
      expect(hrefs.length, guide.slug).toBeGreaterThanOrEqual(5);
      for (const href of hrefs) {
        expect(pages.has(href), `${guide.slug} links to ${href}`).toBe(true);
      }
    }
  });

  it("leave no link markup half-written", () => {
    for (const guide of guides) {
      for (const text of texts(guide)) {
        const shown = splitLinks(text)
          .filter((piece) => piece.kind === "text")
          .map((piece) => piece.text)
          .join("");
        expect(shown, guide.slug).not.toMatch(/\]\(|\[[^\]]*\]$/);
      }
    }
  });

  it("never quote a fee rate, which the admin can change", () => {
    for (const guide of guides) {
      for (const text of texts(guide)) {
        expect(text, guide.slug).not.toMatch(/\d\s?%\s+(\w+\s+)?fee/i);
      }
    }
  });
});
