"use client";

import { XIcon } from "lucide-react";
import { useFilterNav } from "@/components/browse/use-filter-nav";
import { platformMap } from "@/data/platforms";
import { useCurrency } from "@/lib/currency";
import { activeFilterCount, type ListingFilters } from "@/lib/listing-query";
import { formatCompact } from "@/lib/utils";

type Chip = { key: string; label: string; clear: Partial<ListingFilters> };

/** Every applied filter as a removable chip, so nothing is hidden in a panel. */
export function ActiveFilterChips({
  filters,
  hidePlatform,
}: {
  filters: ListingFilters;
  hidePlatform?: boolean;
}) {
  const { apply, clearAll } = useFilterNav(filters, hidePlatform);
  const { format } = useCurrency();

  if (activeFilterCount(filters) === 0) return null;

  const chips: Chip[] = [];

  if (filters.q) {
    chips.push({ key: "q", label: `“${filters.q}”`, clear: { q: "" } });
  }

  if (!hidePlatform) {
    for (const id of filters.platforms) {
      chips.push({
        key: `platform-${id}`,
        label: platformMap[id].name,
        clear: { platforms: filters.platforms.filter((p) => p !== id) },
      });
    }
  }

  for (const niche of filters.niches) {
    chips.push({
      key: `niche-${niche}`,
      label: niche,
      clear: { niches: filters.niches.filter((n) => n !== niche) },
    });
  }

  for (const country of filters.countries) {
    chips.push({
      key: `country-${country}`,
      label: country,
      clear: { countries: filters.countries.filter((c) => c !== country) },
    });
  }

  if (filters.priceMin !== undefined || filters.priceMax !== undefined) {
    const lo =
      filters.priceMin !== undefined ? format(filters.priceMin) : "Any";
    const hi =
      filters.priceMax !== undefined ? format(filters.priceMax) : "Any";
    chips.push({
      key: "price",
      label: `${lo} – ${hi}`,
      clear: { priceMin: undefined, priceMax: undefined },
    });
  }

  if (filters.audienceMin !== undefined || filters.audienceMax !== undefined) {
    const lo =
      filters.audienceMin !== undefined
        ? formatCompact(filters.audienceMin)
        : "0";
    const hi =
      filters.audienceMax !== undefined
        ? formatCompact(filters.audienceMax)
        : "any";
    chips.push({
      key: "audience",
      label: `${lo} – ${hi} audience`,
      clear: { audienceMin: undefined, audienceMax: undefined },
    });
  }

  if (filters.monetized !== undefined) {
    chips.push({
      key: "monetized",
      label: filters.monetized ? "Monetized" : "Not monetized",
      clear: { monetized: undefined },
    });
  }

  if (filters.revenueMin !== undefined) {
    chips.push({
      key: "revenue",
      label: `${format(filters.revenueMin)}+ / mo`,
      clear: { revenueMin: undefined },
    });
  }

  if (filters.ageMin !== undefined) {
    chips.push({
      key: "age",
      label: `${filters.ageMin}+ years old`,
      clear: { ageMin: undefined },
    });
  }

  if (filters.verifiedOnly) {
    chips.push({
      key: "verified",
      label: "Ownership verified",
      clear: { verifiedOnly: false },
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => apply(chip.clear)}
          className="group inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border border-primary/40 bg-primary-soft px-3 text-xs font-medium text-primary-text transition-colors hover:border-primary/70"
        >
          {chip.label}
          <XIcon
            aria-hidden="true"
            className="size-3.5 opacity-60 transition-opacity group-hover:opacity-100"
          />
          <span className="sr-only">Remove filter</span>
        </button>
      ))}

      <button
        type="button"
        onClick={clearAll}
        className="inline-flex min-h-9 cursor-pointer items-center rounded-full px-2.5 text-xs font-medium text-muted underline-offset-4 transition-colors hover:text-fg hover:underline"
      >
        Clear all
      </button>
    </div>
  );
}
