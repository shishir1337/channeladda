import { Categories } from "@/components/home/categories";
import { Faq } from "@/components/home/faq";
import { Hero } from "@/components/home/hero";
import { HowItWorks } from "@/components/home/how-it-works";
import { ListingsShowcase } from "@/components/home/listings-showcase";
import { SellerCta } from "@/components/home/seller-cta";
import { SoldTicker } from "@/components/home/sold-ticker";
import { Testimonials } from "@/components/home/testimonials";
import { TopSellers } from "@/components/home/top-sellers";
import { TrustSafety } from "@/components/home/trust-safety";
import { databaseGate } from "@/lib/db-gate";
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
      <Hero stats={stats} />
      <SoldTicker items={sold} />
      <Categories counts={counts} floors={floors} />
      <ListingsShowcase listings={featured} />
      <HowItWorks />
      <TrustSafety />
      <TopSellers sellers={sellers.slice(0, 4)} />
      <Testimonials />
      <SellerCta />
      <Faq />
    </>
  );
}
