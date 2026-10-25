import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";
import { sitemapEntries } from "@/lib/sitemap";
import { getListingSitemap } from "@/server/listings";
import { getSellerSitemap } from "@/server/sellers";

// Rebuilt hourly: a listing that goes live should reach search without
// waiting for the next deploy.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [listings, sellers] = await Promise.all([
    getListingSitemap(),
    getSellerSitemap(),
  ]);
  return sitemapEntries({ base: siteUrl(), listings, sellers });
}
