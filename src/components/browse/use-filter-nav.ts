"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";
import {
  emptyFilters,
  type ListingFilters,
  serializeFilters,
} from "@/lib/listing-query";

/**
 * Filters live in the URL, so every change is a navigation. Any change other
 * than paging resets to page 1 — otherwise narrowing a search can strand the
 * user on an empty page 4.
 */
export function useFilterNav(
  filters: ListingFilters,
  /** Set on /browse/[platform], where the platform comes from the path. */
  lockedPlatform?: boolean,
) {
  const router = useRouter();
  const pathname = usePathname();

  const hrefFor = useCallback(
    (patch: Partial<ListingFilters>) => {
      const next: ListingFilters = {
        ...filters,
        ...patch,
        page: patch.page ?? 1,
      };
      if (lockedPlatform) next.platforms = [];
      return `${pathname}${serializeFilters(next)}`;
    },
    [filters, pathname, lockedPlatform],
  );

  const apply = useCallback(
    (patch: Partial<ListingFilters>) => {
      // scroll:false keeps the control you just clicked under your cursor.
      router.push(hrefFor(patch), { scroll: false });
    },
    [router, hrefFor],
  );

  /** Adds or removes one value from a multi-select filter. */
  const toggle = useCallback(
    (key: "platforms" | "niches" | "countries", value: string) => {
      const current = filters[key] as string[];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      apply({ [key]: next } as Partial<ListingFilters>);
    },
    [filters, apply],
  );

  const clearAll = useCallback(() => {
    router.push(`${pathname}${serializeFilters(emptyFilters)}`, {
      scroll: false,
    });
  }, [router, pathname]);

  return { apply, toggle, clearAll, hrefFor };
}
