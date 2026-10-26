"use client";

import type { ReactNode } from "react";
import { unsavedHere, useSavedIds } from "@/components/home/saved-store";
import { countOf } from "@/lib/plural";

/**
 * The Saved page's list, kept in step with its hearts.
 *
 * Taking the heart off a card left the card on the page, and "2 listings"
 * above it, until a reload. They read the hearts' own store now, so the card
 * goes as the heart empties — and comes back if the save fails and the heart
 * fills again.
 */
export function SavedListings({
  items,
  empty,
}: {
  /** Each saved listing's card, drawn on the server. */
  items: { id: string; card: ReactNode }[];
  /** Shown once the last one is taken off. */
  empty: ReactNode;
}) {
  const ids = useSavedIds();
  const shown = items.filter((item) => !unsavedHere(ids, item.id));
  if (shown.length === 0) return empty;
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
      {shown.map((item) => (
        <li key={item.id}>{item.card}</li>
      ))}
    </ul>
  );
}

/** "2 listings you saved for later.", counting down as hearts empty. */
export function SavedSummary({ listingIds }: { listingIds: string[] }) {
  const ids = useSavedIds();
  const count = listingIds.filter((id) => !unsavedHere(ids, id)).length;
  if (count === 0) return null;
  return <>{countOf(count, "listing")} you saved for later.</>;
}
