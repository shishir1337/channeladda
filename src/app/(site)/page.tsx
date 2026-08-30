import { Categories } from "@/components/home/categories";
import { Faq } from "@/components/home/faq";
import { Hero } from "@/components/home/hero";
import { HowItWorks } from "@/components/home/how-it-works";
import { ListingsShowcase } from "@/components/home/listings-showcase";
import { SellerCta } from "@/components/home/seller-cta";
import { Services } from "@/components/home/services";
import { SoldTicker } from "@/components/home/sold-ticker";
import { Testimonials } from "@/components/home/testimonials";
import { TopSellers } from "@/components/home/top-sellers";
import { TrustSafety } from "@/components/home/trust-safety";
import { databaseGate } from "@/lib/db-gate";
import {
  getFeaturedListings,
  getPlatformCounts,
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
  const [featured, counts, sold, sellers, stats] = await Promise.all([
    getFeaturedListings(),
    getPlatformCounts(),
    getRecentlySold(10),
    getSellers(),
    getSiteStats(),
  ]);

  return (
    <>
      <Hero stats={stats} />
      <SoldTicker items={sold} />
      <Categories counts={counts} />
      <ListingsShowcase listings={featured} />
      <HowItWorks />
      <TrustSafety />
      <TopSellers sellers={sellers.slice(0, 4)} />
      <Services />
      <Testimonials />
      <SellerCta />
      <Faq />
    </>
  );
}
