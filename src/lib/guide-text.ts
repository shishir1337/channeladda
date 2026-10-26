import type { Guide } from "@/data/guides/types";
import { breadcrumbLd, SITE_NAME } from "@/lib/seo";
import { parseLongDate } from "@/lib/sitemap";

export type TextPiece =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; href: string };

/** `[words](/path)`, to one of our own pages: a slash, then not another. */
const LINK = /\[([^\]]+)\]\((\/(?!\/)[^)\s]*)\)/g;

/**
 * A guide's paragraph as text and links.
 *
 * Only links to our own pages are read. Anything else stays as the
 * characters it was written in, so a typo shows on the page rather than
 * becoming a link somewhere nobody meant.
 */
export function splitLinks(text: string): TextPiece[] {
  const pieces: TextPiece[] = [];
  let at = 0;
  for (const match of text.matchAll(LINK)) {
    const start = match.index ?? 0;
    if (start > at) pieces.push({ kind: "text", text: text.slice(at, start) });
    pieces.push({ kind: "link", text: match[1], href: match[2] });
    at = start + match[0].length;
  }
  if (at < text.length) pieces.push({ kind: "text", text: text.slice(at) });
  return pieces;
}

/** The paragraph as it reads: links as their words. */
function plain(text: string): string {
  return splitLinks(text)
    .map((piece) => piece.text)
    .join("");
}

function count(text: string): number {
  return plain(text).split(/\s+/).filter(Boolean).length;
}

/** Every word a reader reads, headings and questions included. */
export function guideWords(guide: Guide): number {
  let words = guide.intro.reduce((sum, p) => sum + count(p), 0);
  for (const section of guide.sections) {
    words += count(section.heading);
    for (const block of section.blocks) {
      words +=
        block.kind === "p"
          ? count(block.text)
          : block.items.reduce((sum, item) => sum + count(item), 0);
    }
  }
  for (const faq of guide.faqs) {
    words += count(faq.question) + count(faq.answer);
  }
  return words;
}

/** Minutes at about 200 words a minute, and never "0 min read". */
export function readingMinutes(guide: Guide): number {
  return Math.max(1, Math.round(guideWords(guide) / 200));
}

/** "2026-10-26" from "26 October 2026". */
function isoDay(text: string): string | undefined {
  return parseLongDate(text)?.toISOString().slice(0, 10);
}

/**
 * The guide as an article written by Channel Adda, and where it sits.
 *
 * The author is the company rather than a person: nobody's name is on
 * these, and an invented one would be the first thing a reader checked.
 */
export function guideLd(base: string, guide: Guide) {
  const url = `${base}/guides/${guide.slug}`;
  const day = isoDay(guide.updated);
  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.title,
    description: guide.description,
    url,
    mainEntityOfPage: url,
    inLanguage: "en",
    ...(day ? { datePublished: day, dateModified: day } : {}),
    wordCount: guideWords(guide),
    image: `${base}/opengraph-image`,
    author: {
      "@type": "Organization",
      "@id": `${base}/#organization`,
      name: SITE_NAME,
    },
    publisher: { "@id": `${base}/#organization` },
  };
  const crumbs = breadcrumbLd(base, [
    { name: "Home", path: "/" },
    { name: "Guides", path: "/guides" },
    { name: guide.title, path: `/guides/${guide.slug}` },
  ]);
  return [article, crumbs] as const;
}
