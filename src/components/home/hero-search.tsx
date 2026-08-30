"use client";

import { ChevronDownIcon, SearchIcon, TrendingUpIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { type PlatformId, platforms } from "@/data/platforms";
import { emptyFilters, serializeFilters } from "@/lib/listing-query";
import { cn } from "@/lib/utils";

const budgets = [
  { value: "any", label: "Any budget" },
  { value: "0-500", label: "Under $500" },
  { value: "500-2500", label: "$500 – $2,500" },
  { value: "2500-10000", label: "$2,500 – $10,000" },
  { value: "10000-50000", label: "$10,000 – $50,000" },
  { value: "50000-", label: "$50,000+" },
];

const popularSearches = [
  "Monetized YouTube channels",
  "US audience Instagram",
  "Crypto Telegram channels",
  "Faceless channels under $5K",
  "Monetized Facebook pages",
  "AdSense websites",
];

type Filter = PlatformId | "all";

export function HeroSearch() {
  const router = useRouter();
  const [platform, setPlatform] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [budget, setBudget] = useState("any");
  const searchId = useId();
  const budgetId = useId();

  const active = platforms.find((p) => p.id === platform);
  const placeholder =
    active?.searchPlaceholder ?? "Search by niche, audience country or handle";

  return (
    <div id="search" className="scroll-mt-28">
      {/* Platform filter: a scrollable rail on mobile, full row from sm up.
          These are toggle buttons, not tabs — no panel is swapped, so they
          expose aria-pressed rather than tab/tablist roles. */}
      <fieldset className="no-scrollbar edge-fade-r -mx-4 flex min-w-0 gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0 sm:[mask-image:none]">
        <legend className="sr-only">Filter by platform</legend>
        <PlatformChip
          selected={platform === "all"}
          onSelect={() => setPlatform("all")}
          label="All platforms"
        />
        {platforms.map((p) => (
          <PlatformChip
            key={p.id}
            selected={platform === p.id}
            onSelect={() => setPlatform(p.id)}
            label={p.name}
            icon={<p.icon className="size-4" style={{ color: p.tint }} />}
          />
        ))}
      </fieldset>

      {/* <search> gives the landmark; the form itself stays role-free. */}
      <search>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const [lo, hi] = budget === "any" ? [] : budget.split("-");
            router.push(
              `/browse${serializeFilters({
                ...emptyFilters,
                q: query,
                platforms: platform === "all" ? [] : [platform],
                priceMin: lo ? Number(lo) : undefined,
                priceMax: hi ? Number(hi) : undefined,
              })}`,
            );
          }}
          aria-label="Search accounts for sale"
          className="mt-4 rounded-panel border border-line bg-surface p-2 shadow-lift sm:mt-5 sm:rounded-[1.75rem]"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <label htmlFor={searchId} className="sr-only">
                Search accounts for sale
              </label>
              <SearchIcon
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-subtle"
              />
              <input
                id={searchId}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={placeholder}
                // 16px minimum keeps iOS from auto-zooming the field on focus.
                className="h-14 w-full rounded-2xl bg-transparent pr-4 pl-12 text-base text-fg placeholder:text-subtle focus:outline-none"
              />
            </div>

            <div
              aria-hidden="true"
              className="hidden h-8 w-px shrink-0 bg-line sm:block"
            />

            <div className="relative shrink-0">
              <label htmlFor={budgetId} className="sr-only">
                Budget range
              </label>
              <select
                id={budgetId}
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                className="h-14 w-full cursor-pointer appearance-none rounded-2xl bg-surface-2 pr-11 pl-4 text-[0.9375rem] font-medium text-fg focus:outline-none sm:w-auto sm:min-w-[10.5rem] sm:bg-transparent"
              >
                {budgets.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
              <ChevronDownIcon
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-subtle"
              />
            </div>

            <Button type="submit" size="lg" className="h-14 w-full sm:w-auto">
              <SearchIcon aria-hidden="true" className="size-5" />
              Search
            </Button>
          </div>
        </form>
      </search>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-subtle">
          <TrendingUpIcon aria-hidden="true" className="size-3.5" />
          Popular
        </span>
        {popularSearches.map((term) => (
          <Link
            key={term}
            href={`/browse${serializeFilters({ ...emptyFilters, q: term })}`}
            // Full 44px target on touch; tightened once hover is the input.
            className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-3.5 text-xs font-medium text-muted transition-colors duration-200 hover:border-primary/50 hover:bg-primary-soft hover:text-primary-text sm:min-h-9"
          >
            {term}
          </Link>
        ))}
      </div>
    </div>
  );
}

function PlatformChip({
  selected,
  onSelect,
  label,
  icon,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-all duration-200 ease-[var(--ease-out-soft)]",
        selected
          ? "border-primary bg-primary text-primary-fg shadow-soft"
          : "border-line bg-surface text-muted hover:border-line-strong hover:text-fg",
      )}
    >
      {icon ? (
        <span className={cn(selected && "[&_svg]:!text-primary-fg")}>
          {icon}
        </span>
      ) : null}
      {label}
    </button>
  );
}
