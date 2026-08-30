"use client";

import { BadgeCheckIcon, RotateCcwIcon } from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";
import { useFilterNav } from "@/components/browse/use-filter-nav";
import { platformMap } from "@/data/platforms";
import { useCurrency } from "@/lib/currency";
import type { ListingFilters, QueryResult } from "@/lib/listing-query";
import { activeFilterCount } from "@/lib/listing-query";
import { cn } from "@/lib/utils";

const audienceBands = [
  { label: "Any size", min: undefined, max: undefined },
  { label: "Under 100K", min: undefined, max: 100_000 },
  { label: "100K – 500K", min: 100_000, max: 500_000 },
  { label: "500K – 1M", min: 500_000, max: 1_000_000 },
  { label: "1M and above", min: 1_000_000, max: undefined },
];

const ageBands = [
  { label: "Any age", value: undefined },
  { label: "1+ years", value: 1 },
  { label: "2+ years", value: 2 },
  { label: "3+ years", value: 3 },
  { label: "5+ years", value: 5 },
];

const revenueBands = [
  { label: "Any revenue", value: undefined },
  { label: "$500+ / mo", value: 500 },
  { label: "$1,000+ / mo", value: 1000 },
  { label: "$2,500+ / mo", value: 2500 },
];

export function FilterPanel({
  filters,
  facets,
  hidePlatform,
  onNavigate,
}: {
  filters: ListingFilters;
  facets: QueryResult["facets"];
  /** True on /browse/[platform], where the platform is fixed by the route. */
  hidePlatform?: boolean;
  /** Lets the mobile sheet close itself once a filter is applied. */
  onNavigate?: () => void;
}) {
  const { apply, toggle, clearAll } = useFilterNav(filters, hidePlatform);
  const count = activeFilterCount(filters);

  const act = (fn: () => void) => {
    fn();
    onNavigate?.();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-base font-semibold">Filters</h2>
        {count > 0 ? (
          <button
            type="button"
            onClick={() => act(clearAll)}
            className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted transition-colors hover:text-fg"
          >
            <RotateCcwIcon aria-hidden="true" className="size-3.5" />
            Clear all
          </button>
        ) : null}
      </div>

      {!hidePlatform ? (
        <Section title="Platform">
          <ul className="flex flex-col gap-1">
            {facets.platforms.map((facet) => {
              const platform =
                platformMap[facet.value as keyof typeof platformMap];
              return (
                <li key={facet.value}>
                  <CheckRow
                    checked={filters.platforms.includes(
                      facet.value as (typeof filters.platforms)[number],
                    )}
                    disabled={facet.count === 0}
                    count={facet.count}
                    onChange={() => act(() => toggle("platforms", facet.value))}
                  >
                    <platform.icon
                      className="size-4 shrink-0"
                      style={{ color: platform.tint }}
                    />
                    {facet.label}
                  </CheckRow>
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      <PriceSection filters={filters} onApply={(p) => act(() => apply(p))} />

      <Section title="Audience size">
        <RadioGroup
          name="audience"
          options={audienceBands.map((b) => ({
            label: b.label,
            selected:
              filters.audienceMin === b.min && filters.audienceMax === b.max,
            onSelect: () =>
              act(() => apply({ audienceMin: b.min, audienceMax: b.max })),
          }))}
        />
      </Section>

      <Section title="Monetization">
        <RadioGroup
          name="monetized"
          options={[
            { label: "Any", value: undefined },
            { label: "Monetized only", value: true },
            { label: "Not monetized", value: false },
          ].map((o) => ({
            label: o.label,
            selected: filters.monetized === o.value,
            onSelect: () => act(() => apply({ monetized: o.value })),
          }))}
        />
      </Section>

      <Section title="Monthly revenue">
        <RadioGroup
          name="revenue"
          options={revenueBands.map((b) => ({
            label: b.label,
            selected: filters.revenueMin === b.value,
            onSelect: () => act(() => apply({ revenueMin: b.value })),
          }))}
        />
      </Section>

      <Section title="Account age">
        <RadioGroup
          name="age"
          options={ageBands.map((b) => ({
            label: b.label,
            selected: filters.ageMin === b.value,
            onSelect: () => act(() => apply({ ageMin: b.value })),
          }))}
        />
      </Section>

      {facets.niches.length ? (
        <Section title="Niche" scroll>
          <ul className="flex flex-col gap-1">
            {facets.niches.map((facet) => (
              <li key={facet.value}>
                <CheckRow
                  checked={filters.niches.includes(facet.value)}
                  disabled={facet.count === 0}
                  count={facet.count}
                  onChange={() => act(() => toggle("niches", facet.value))}
                >
                  {facet.label}
                </CheckRow>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {facets.countries.length ? (
        <Section title="Audience country" scroll>
          <ul className="flex flex-col gap-1">
            {facets.countries.map((facet) => (
              <li key={facet.value}>
                <CheckRow
                  checked={filters.countries.includes(facet.value)}
                  disabled={facet.count === 0}
                  count={facet.count}
                  onChange={() => act(() => toggle("countries", facet.value))}
                >
                  {facet.label}
                </CheckRow>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Verification">
        <CheckRow
          checked={filters.verifiedOnly}
          onChange={() =>
            act(() => apply({ verifiedOnly: !filters.verifiedOnly }))
          }
        >
          <BadgeCheckIcon aria-hidden="true" className="size-4 text-verified" />
          Ownership verified only
        </CheckRow>
      </Section>
    </div>
  );
}

/** Free-text price range. Committed on blur or Enter, never per keystroke. */
function PriceSection({
  filters,
  onApply,
}: {
  filters: ListingFilters;
  onApply: (patch: Partial<ListingFilters>) => void;
}) {
  const minId = useId();
  const maxId = useId();
  const { currency, format } = useCurrency();

  const [min, setMin] = useState(filters.priceMin?.toString() ?? "");
  const [max, setMax] = useState(filters.priceMax?.toString() ?? "");

  // Keep the inputs in step when filters change from elsewhere (chips, reset).
  useEffect(() => {
    setMin(filters.priceMin?.toString() ?? "");
    setMax(filters.priceMax?.toString() ?? "");
  }, [filters.priceMin, filters.priceMax]);

  const commit = () => {
    const lo = min.trim() === "" ? undefined : Math.max(0, Number(min));
    const hi = max.trim() === "" ? undefined : Math.max(0, Number(max));
    if (lo !== undefined && Number.isNaN(lo)) return;
    if (hi !== undefined && Number.isNaN(hi)) return;
    // Swap rather than reject when the range is entered backwards.
    const [a, b] =
      lo !== undefined && hi !== undefined && lo > hi ? [hi, lo] : [lo, hi];
    onApply({ priceMin: a, priceMax: b });
  };

  return (
    <Section title={`Price (${currency.code})`}>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label htmlFor={minId} className="sr-only">
            Minimum price
          </label>
          <input
            id={minId}
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Min"
            value={min}
            onChange={(e) => setMin(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && commit()}
            className="tnum h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-fg placeholder:text-subtle focus:border-primary/60 focus:outline-none"
          />
        </div>
        <span aria-hidden="true" className="text-subtle">
          –
        </span>
        <div className="flex-1">
          <label htmlFor={maxId} className="sr-only">
            Maximum price
          </label>
          <input
            id={maxId}
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Max"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && commit()}
            className="tnum h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-fg placeholder:text-subtle focus:border-primary/60 focus:outline-none"
          />
        </div>
      </div>
      <p className="mt-2 text-xs text-subtle">
        Listings run {format(25)} to {format(79_000)}.
      </p>
    </Section>
  );
}

function Section({
  title,
  children,
  scroll,
}: {
  title: string;
  children: ReactNode;
  scroll?: boolean;
}) {
  return (
    <fieldset className="border-t border-line pt-5 first-of-type:border-t-0 first-of-type:pt-0">
      <legend className="mb-3 text-xs font-semibold tracking-[0.1em] text-subtle uppercase">
        {title}
      </legend>
      <div className={cn(scroll && "max-h-56 overflow-y-auto pr-1")}>
        {children}
      </div>
    </fieldset>
  );
}

function CheckRow({
  checked,
  disabled,
  count,
  onChange,
  children,
}: {
  checked: boolean;
  disabled?: boolean;
  count?: number;
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm transition-colors",
        disabled
          ? "cursor-not-allowed text-subtle opacity-50"
          : "text-muted hover:bg-surface-2 hover:text-fg",
        checked && !disabled && "text-fg",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="size-4 shrink-0 cursor-pointer accent-primary"
      />
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
      {count !== undefined ? (
        <span className="tnum shrink-0 text-xs text-subtle">{count}</span>
      ) : null}
    </label>
  );
}

function RadioGroup({
  name,
  options,
}: {
  name: string;
  options: { label: string; selected: boolean; onSelect: () => void }[];
}) {
  const groupId = useId();
  return (
    <div className="flex flex-col gap-1">
      {options.map((option) => (
        <label
          key={option.label}
          className={cn(
            "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm transition-colors hover:bg-surface-2",
            option.selected ? "text-fg" : "text-muted hover:text-fg",
          )}
        >
          <input
            type="radio"
            name={`${name}-${groupId}`}
            checked={option.selected}
            onChange={option.onSelect}
            className="size-4 shrink-0 cursor-pointer accent-primary"
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}
