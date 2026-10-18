import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";
import { getListingSlugs } from "@/server/listings";
import { getSellerSlugs } from "@/server/sellers";

// Rebuilt hourly: a listing that goes live should reach search without
// waiting for the next deploy.
export const revalidate = 3600;

/** Every public page that is not a listing or a seller. */
const PAGES = [
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
  "/listing-rules",
  "/terms",
  "/privacy",
  "/refunds",
  "/aml-kyc",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const [listings, sellers] = await Promise.all([
    getListingSlugs(),
    getSellerSlugs(),
  ]);

  return [
    ...PAGES.map((path) => ({ url: `${base}${path}` })),
    ...listings.map((slug) => ({ url: `${base}/listing/${slug}` })),
    ...sellers.map((slug) => ({ url: `${base}/seller/${slug}` })),
  ];
}
