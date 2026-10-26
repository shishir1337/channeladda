import type { Metadata } from "next";
import { Categories } from "@/components/home/categories";
import { Faq } from "@/components/home/faq";
import { Hero } from "@/components/home/hero";
import { ListingsShowcase } from "@/components/home/listings-showcase";
import { SellerCta } from "@/components/home/seller-cta";
import { SoldTicker } from "@/components/home/sold-ticker";
import { Testimonials } from "@/components/home/testimonials";
import { TopSellers } from "@/components/home/top-sellers";
import { JsonLd } from "@/components/site/json-ld";
import { databaseGate } from "@/lib/db-gate";
import { pageMetadata, SITE_DESCRIPTION, SITE_TITLE, siteLd } from "@/lib/seo";
import { siteUrl } from "@/lib/site-url";
import {
  getFeaturedListings,
  getPlatformCounts,
  getPlatformFloors,
  getRecentlySold,
} from "@/server/listings";
import { getSellers, getSiteStats } from "@/server/sellers";

/** Marketplace data changes constantly; Prisma queries are invisible to Next's
 *  cache detection, so revalidation is declared explicitly. */
export const revalidate = 60;

export const metadata: Metadata = pageMetadata({
  title: { absolute: SITE_TITLE },
  description: SITE_DESCRIPTION,
  path: "/",
});

export default async function HomePage() {
  const gate = await databaseGate();
  if (gate) return gate;

  // One round trip per section rather than each component reaching for data.
  const [featured, counts, floors, sold, sellers, stats] = await Promise.all([
    getFeaturedListings(),
    getPlatformCounts(),
    getPlatformFloors(),
    getRecentlySold(10),
    getSellers(),
    getSiteStats(),
  ]);

  return (
    <>
      <JsonLd data={siteLd(siteUrl(), SITE_DESCRIPTION)} />
      <Hero stats={stats} />
      <SoldTicker items={sold} />
      <Categories counts={counts} floors={floors} />
      <ListingsShowcase listings={featured} />
      {/* How it works and Trust & safety have their own pages, linked
          from the header; the owner took them off the homepage. */}
      <TopSellers sellers={sellers.slice(0, 4)} />
      <Testimonials />
      <SellerCta />
      <Faq />
    </>
  );
}
