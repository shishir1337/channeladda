import type { Metadata } from "next";
import { BrowseView } from "@/components/browse/browse-view";
import { PageHeader } from "@/components/ui/page-header";
import { databaseGate } from "@/lib/db-gate";
import { parseFilters } from "@/lib/listing-query";
import { getPlatformCounts, queryListings } from "@/server/listings";

export const metadata: Metadata = {
  title: "Browse accounts for sale",
  description:
    "Search every verified YouTube channel, Instagram page, Facebook page, Telegram channel and content website for sale on Channel Adda. Filter by price, audience, monetization and country.",
};

export default async function BrowsePage({
  searchParams,
}: PageProps<"/browse">) {
  const gate = await databaseGate();
  if (gate) return gate;

  const filters = parseFilters(await searchParams);
  const [result, counts] = await Promise.all([
    queryListings(filters),
    getPlatformCounts(),
  ]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Home", href: "/" }, { label: "Browse" }]}
        eyebrow="Marketplace"
        title="Every account on the block"
        description={`${total.toLocaleString("en-US")} listings across five platforms. Ownership is verified before anything reaches this page.`}
      />
      <BrowseView filters={filters} result={result} basePath="/browse" />
    </>
  );
}
