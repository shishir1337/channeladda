import { SearchXIcon } from "lucide-react";
import Link from "next/link";
import { ActiveFilterChips } from "@/components/browse/active-filter-chips";
import { BrowseToolbar } from "@/components/browse/browse-toolbar";
import { FilterPanel } from "@/components/browse/filter-panel";
import { ListingCard } from "@/components/home/listing-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Container } from "@/components/ui/section";
import {
  type ListingFilters,
  type QueryResult,
  serializeFilters,
} from "@/lib/listing-query";

/**
 * Results body shared by /browse and /browse/[platform]. Everything here is
 * server-rendered; only the controls are client components.
 */
export function BrowseView({
  filters,
  result,
  basePath,
  hidePlatform,
}: {
  filters: ListingFilters;
  result: QueryResult;
  /** "/browse" or "/browse/youtube" — pagination links keep the segment. */
  basePath: string;
  hidePlatform?: boolean;
}) {
  const hrefForPage = (page: number) => {
    const next = { ...filters, page };
    if (hidePlatform) next.platforms = [];
    return `${basePath}${serializeFilters(next)}`;
  };

  return (
    <Container className="py-8 sm:py-10 lg:py-12">
      <div className="lg:grid lg:grid-cols-[17rem_1fr] lg:gap-10">
        {/* Desktop filter rail. On mobile the same panel lives in a sheet. */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100dvh-8rem)] overflow-y-auto rounded-card border border-line bg-surface p-5">
            <FilterPanel
              filters={filters}
              facets={result.facets}
              hidePlatform={hidePlatform}
            />
          </div>
        </aside>

        <div className="min-w-0">
          <BrowseToolbar
            filters={filters}
            facets={result.facets}
            total={result.total}
            hidePlatform={hidePlatform}
          />

          <div className="mt-4">
            <ActiveFilterChips filters={filters} hidePlatform={hidePlatform} />
          </div>

          {result.items.length === 0 ? (
            <EmptyState
              icon={SearchXIcon}
              title="Nothing matches those filters"
              description="Try widening the price range or clearing a filter or two. New accounts are listed every day."
              action={
                <Button asChild size="md">
                  <Link href={basePath}>Clear all filters</Link>
                </Button>
              }
              className="mt-6"
            />
          ) : (
            <>
              <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {result.items.map((listing, i) => (
                  <li key={listing.id}>
                    <ListingCard listing={listing} priority={i < 3} />
                  </li>
                ))}
              </ul>

              <Pagination
                page={result.page}
                pageCount={result.pageCount}
                hrefFor={hrefForPage}
                className="mt-10 sm:mt-12"
              />
            </>
          )}
        </div>
      </div>
    </Container>
  );
}
