import type { Metadata } from "next";
import { BrowseView } from "@/components/browse/browse-view";
import { PageHeader } from "@/components/ui/page-header";
import { databaseGate } from "@/lib/db-gate";
import { parseFilters } from "@/lib/listing-query";
import { countOf } from "@/lib/plural";
import { pagedPath, pagedTitle, pageMetadata } from "@/lib/seo";
import { getPlatformCounts, queryListings } from "@/server/listings";

export async function generateMetadata({
  searchParams,
}: PageProps<"/browse">): Promise<Metadata> {
  const { page } = parseFilters(await searchParams);
  const description =
    "Verified YouTube channels, Instagram and Facebook pages, Telegram channels and websites for sale. Filter by price, audience, revenue and country.";
  return pageMetadata({
    title: pagedTitle("Browse accounts for sale", page),
    description: page > 1 ? `Page ${page}. ${description}` : description,
    // Each page of the list is its own page to a search engine; the
    // filters are not, so they are left out of the address.
    path: pagedPath("/browse", page),
  });
}

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
        title="Every account on the block"
        description={`${countOf(total, "listing")} across five platforms. Ownership is verified before anything reaches this page.`}
      />
      <BrowseView filters={filters} result={result} basePath="/browse" />
    </>
  );
}
