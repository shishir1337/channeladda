/**
 * Filter shapes and the URL codec. Shared by the client controls and the
 * server repository — the actual querying lives in `src/server/listings.ts`
 * so there is only ever one implementation of the filtering rules.
 */
import type { Listing } from "@/data/listings";
import { type PlatformId, platforms } from "@/data/platforms";

export const PAGE_SIZE = 12;

export type SortKey =
  | "newest"
  | "price-asc"
  | "price-desc"
  | "audience-desc"
  | "revenue-desc"
  | "engagement-desc";

export const sortOptions: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "audience-desc", label: "Largest audience" },
  { value: "revenue-desc", label: "Highest revenue" },
  { value: "engagement-desc", label: "Best engagement" },
];

export type ListingFilters = {
  q: string;
  platforms: PlatformId[];
  niches: string[];
  countries: string[];
  priceMin?: number;
  priceMax?: number;
  audienceMin?: number;
  audienceMax?: number;
  /** undefined = either, true = monetized only, false = not monetized only. */
  monetized?: boolean;
  verifiedOnly: boolean;
  revenueMin?: number;
  ageMin?: number;
  sort: SortKey;
  page: number;
};

export const emptyFilters: ListingFilters = {
  q: "",
  platforms: [],
  niches: [],
  countries: [],
  verifiedOnly: false,
  sort: "newest",
  page: 1,
};

/** Query-string keys, kept short so shared links stay readable. */
const KEYS = {
  q: "q",
  platforms: "platform",
  niches: "niche",
  countries: "country",
  priceMin: "price_min",
  priceMax: "price_max",
  audienceMin: "aud_min",
  audienceMax: "aud_max",
  monetized: "monetized",
  verifiedOnly: "verified",
  revenueMin: "rev_min",
  ageMin: "age_min",
  sort: "sort",
  page: "page",
} as const;

type RawParams = Record<string, string | string[] | undefined>;

function one(raw: RawParams, key: string): string | undefined {
  const v = raw[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() ? s.trim() : undefined;
}

function list(raw: RawParams, key: string): string[] {
  const v = one(raw, key);
  if (!v) return [];
  return [
    ...new Set(
      v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

function num(raw: RawParams, key: string): number | undefined {
  const v = one(raw, key);
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

const platformIds = new Set(platforms.map((p) => p.id));
const sortKeys = new Set(sortOptions.map((s) => s.value));

/**
 * Reads filters out of the URL. Anything unrecognised is dropped rather than
 * throwing, so a hand-edited or stale link still renders a sensible page.
 */
export function parseFilters(raw: RawParams): ListingFilters {
  const monetizedRaw = one(raw, KEYS.monetized);
  const sortRaw = one(raw, KEYS.sort);
  const page = num(raw, KEYS.page) ?? 1;

  return {
    q: one(raw, KEYS.q) ?? "",
    platforms: list(raw, KEYS.platforms).filter((p): p is PlatformId =>
      platformIds.has(p as PlatformId),
    ),
    niches: list(raw, KEYS.niches),
    countries: list(raw, KEYS.countries),
    priceMin: num(raw, KEYS.priceMin),
    priceMax: num(raw, KEYS.priceMax),
    audienceMin: num(raw, KEYS.audienceMin),
    audienceMax: num(raw, KEYS.audienceMax),
    monetized:
      monetizedRaw === "true"
        ? true
        : monetizedRaw === "false"
          ? false
          : undefined,
    verifiedOnly: one(raw, KEYS.verifiedOnly) === "true",
    revenueMin: num(raw, KEYS.revenueMin),
    ageMin: num(raw, KEYS.ageMin),
    sort:
      sortRaw && sortKeys.has(sortRaw as SortKey)
        ? (sortRaw as SortKey)
        : "newest",
    page: Math.max(1, Math.floor(page)),
  };
}

/** Serialises back to a query string, omitting anything at its default. */
export function serializeFilters(f: Partial<ListingFilters>): string {
  const p = new URLSearchParams();
  if (f.q) p.set(KEYS.q, f.q);
  if (f.platforms?.length) p.set(KEYS.platforms, f.platforms.join(","));
  if (f.niches?.length) p.set(KEYS.niches, f.niches.join(","));
  if (f.countries?.length) p.set(KEYS.countries, f.countries.join(","));
  if (f.priceMin !== undefined) p.set(KEYS.priceMin, String(f.priceMin));
  if (f.priceMax !== undefined) p.set(KEYS.priceMax, String(f.priceMax));
  if (f.audienceMin !== undefined)
    p.set(KEYS.audienceMin, String(f.audienceMin));
  if (f.audienceMax !== undefined)
    p.set(KEYS.audienceMax, String(f.audienceMax));
  if (f.monetized !== undefined) p.set(KEYS.monetized, String(f.monetized));
  if (f.verifiedOnly) p.set(KEYS.verifiedOnly, "true");
  if (f.revenueMin !== undefined) p.set(KEYS.revenueMin, String(f.revenueMin));
  if (f.ageMin !== undefined) p.set(KEYS.ageMin, String(f.ageMin));
  if (f.sort && f.sort !== "newest") p.set(KEYS.sort, f.sort);
  if (f.page && f.page > 1) p.set(KEYS.page, String(f.page));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** How many filters the user has actually applied — drives the badge count. */
export function activeFilterCount(f: ListingFilters): number {
  return (
    (f.q ? 1 : 0) +
    f.platforms.length +
    f.niches.length +
    f.countries.length +
    (f.priceMin !== undefined || f.priceMax !== undefined ? 1 : 0) +
    (f.audienceMin !== undefined || f.audienceMax !== undefined ? 1 : 0) +
    (f.monetized !== undefined ? 1 : 0) +
    (f.verifiedOnly ? 1 : 0) +
    (f.revenueMin !== undefined ? 1 : 0) +
    (f.ageMin !== undefined ? 1 : 0)
  );
}

export type Facet = { value: string; label: string; count: number };

export type QueryResult = {
  items: Listing[];
  total: number;
  page: number;
  pageCount: number;
  facets: {
    platforms: Facet[];
    niches: Facet[];
    countries: Facet[];
  };
  /** Cheapest and dearest live listing, for slider bounds. */
  priceBounds: { min: number; max: number };
};
