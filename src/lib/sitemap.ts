import type { MetadataRoute } from "next";
import { helpArticles } from "@/data/help";
import { legalDocs } from "@/data/legal";
import { platforms } from "@/data/platforms";

/**
 * Every public page a search engine should know about.
 *
 * Kept apart from `app/sitemap.ts` so the list can be checked without a
 * database: the platform pages and the help articles were missing from it
 * for months, and nothing noticed.
 */

/** Public pages that are not a listing, a seller, a platform or an article. */
export const STATIC_PAGES = [
  "/",
  "/browse",
  "/sold",
  "/sellers",
  "/sell",
  "/how-it-works",
  "/fees",
  "/trust-safety",
  "/services",
  "/about",
  "/help",
  "/support",
  "/affiliates",
  "/certificate",
  "/listing-rules",
  "/terms",
  "/privacy",
  "/refunds",
  "/aml-kyc",
] as const;

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/** "26 October 2026", as the policies print it, or null if it is not one. */
export function parseLongDate(text: string): Date | null {
  const match = /^(\d{1,2}) ([A-Za-z]+) (\d{4})$/.exec(text.trim());
  if (!match) return null;
  const month = MONTHS.indexOf(match[2].toLowerCase());
  if (month < 0) return null;
  return new Date(Date.UTC(Number(match[3]), month, Number(match[1])));
}

/** When each policy page last changed, by its path. */
function policyDates(): Map<string, Date> {
  const dates = new Map<string, Date>();
  for (const doc of Object.values(legalDocs)) {
    const date = parseLongDate(doc.updated);
    if (date) dates.set(`/${doc.slug}`, date);
  }
  return dates;
}

export type Dated = { slug: string; updatedAt: Date };

export function sitemapEntries(input: {
  base: string;
  listings: Dated[];
  sellers: Dated[];
}): MetadataRoute.Sitemap {
  const { base } = input;
  const policies = policyDates();
  const at = (path: string, lastModified?: Date) => ({
    url: `${base}${path}`,
    ...(lastModified ? { lastModified } : {}),
  });

  return [
    ...STATIC_PAGES.map((path) => at(path, policies.get(path))),
    ...platforms.map((p) => at(`/browse/${p.id}`)),
    ...helpArticles.map((article) => at(`/help/${article.slug}`)),
    ...input.listings.map((l) => at(`/listing/${l.slug}`, l.updatedAt)),
    ...input.sellers.map((s) => at(`/seller/${s.slug}`, s.updatedAt)),
  ];
}
