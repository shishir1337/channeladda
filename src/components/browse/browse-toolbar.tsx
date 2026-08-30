"use client";

import { SearchIcon, SlidersHorizontalIcon, XIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { FilterPanel } from "@/components/browse/filter-panel";
import { useFilterNav } from "@/components/browse/use-filter-nav";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  activeFilterCount,
  type ListingFilters,
  type QueryResult,
  sortOptions,
} from "@/lib/listing-query";

export function BrowseToolbar({
  filters,
  facets,
  total,
  hidePlatform,
}: {
  filters: ListingFilters;
  facets: QueryResult["facets"];
  total: number;
  hidePlatform?: boolean;
}) {
  const { apply } = useFilterNav(filters, hidePlatform);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [q, setQ] = useState(filters.q);
  const searchId = useId();
  const sortId = useId();
  const count = activeFilterCount(filters);

  // Reflect changes made elsewhere (a removed chip, Clear all).
  useEffect(() => setQ(filters.q), [filters.q]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            apply({ q });
          }}
        >
          <label htmlFor={searchId} className="sr-only">
            Search listings
          </label>
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3.5 size-[1.15rem] -translate-y-1/2 text-subtle"
          />
          <input
            id={searchId}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by handle, niche or country"
            className="h-12 w-full rounded-xl border border-line bg-surface pr-10 pl-11 text-base text-fg placeholder:text-subtle focus:border-primary/60 focus:outline-none sm:text-[0.9375rem]"
          />
          {q ? (
            <button
              type="button"
              onClick={() => {
                setQ("");
                apply({ q: "" });
              }}
              aria-label="Clear search"
              className="absolute top-1/2 right-1 inline-flex size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-subtle transition-colors hover:text-fg"
            >
              <XIcon aria-hidden="true" className="size-4" />
            </button>
          ) : null}
        </form>

        <div className="flex items-center gap-2">
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="inline-flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-medium text-fg transition-colors hover:border-line-strong lg:hidden"
              >
                <SlidersHorizontalIcon aria-hidden="true" className="size-4" />
                Filters
                {count > 0 ? (
                  <span className="tnum rounded-md bg-primary px-1.5 py-0.5 text-[0.6875rem] font-semibold text-primary-fg">
                    {count}
                  </span>
                ) : null}
              </button>
            </SheetTrigger>
            <SheetContent>
              <SheetTitle className="border-b border-line px-6 py-5 font-display text-lg font-bold">
                Filters
              </SheetTitle>
              <SheetDescription className="sr-only">
                Narrow the listings by platform, price, audience and more
              </SheetDescription>
              <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-6">
                <FilterPanel
                  filters={filters}
                  facets={facets}
                  hidePlatform={hidePlatform}
                  onNavigate={() => setSheetOpen(false)}
                />
              </div>
            </SheetContent>
          </Sheet>

          <div className="relative shrink-0">
            <label htmlFor={sortId} className="sr-only">
              Sort listings
            </label>
            <select
              id={sortId}
              value={filters.sort}
              onChange={(e) =>
                apply({ sort: e.target.value as ListingFilters["sort"] })
              }
              className="h-12 w-full cursor-pointer appearance-none rounded-xl border border-line bg-surface pr-9 pl-4 text-sm font-medium text-fg focus:border-primary/60 focus:outline-none"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-xs text-subtle"
            >
              ▾
            </span>
          </div>
        </div>
      </div>

      <p aria-live="polite" className="text-sm text-muted">
        <span className="tnum font-semibold text-fg">{total}</span>{" "}
        {total === 1 ? "listing" : "listings"}
        {filters.q ? (
          <>
            {" "}
            matching <span className="text-fg">&ldquo;{filters.q}&rdquo;</span>
          </>
        ) : null}
      </p>
    </div>
  );
}
