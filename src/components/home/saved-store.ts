"use client";

import { useEffect, useSyncExternalStore } from "react";
import { withSaved } from "@/lib/saved-ids";

/**
 * Which listings the person looking has saved.
 *
 * One fetch per page load, shared by every heart on it, rather than one
 * request per card. Kept in a module-level store so a browse page with
 * twenty-four cards asks once — and so everything else on the page that
 * depends on a heart reads the same answer the heart does: the "watching"
 * count beside it, and the Saved page's own list. Both used to wait for a
 * reload.
 */
const store = {
  ids: null as Set<string> | null,
  /**
   * What the server said when the page loaded, to tell a save made here
   * from one made before. Null until then, and if the fetch failed.
   */
  loaded: null as ReadonlySet<string> | null,
  loading: null as Promise<void> | null,
  listeners: new Set<() => void>(),

  emit() {
    for (const listener of this.listeners) listener();
  },

  subscribe(listener: () => void) {
    store.listeners.add(listener);
    return () => {
      store.listeners.delete(listener);
    };
  },

  snapshot() {
    return store.ids;
  },

  async load() {
    if (store.ids || store.loading) return store.loading ?? undefined;
    store.loading = (async () => {
      try {
        const res = await fetch("/api/favourites");
        const data = (await res.json()) as { ids?: string[] };
        store.ids = new Set(data.ids ?? []);
        store.loaded = new Set(store.ids);
      } catch {
        // Offline or blocked: treat as nothing saved rather than breaking the
        // page. The button still works and will correct itself on reload.
        store.ids = new Set();
      }
      store.loading = null;
      store.emit();
    })();
    return store.loading;
  },

  set(listingId: string, favourited: boolean) {
    store.ids = withSaved(store.ids, listingId, favourited);
    store.emit();
  },
};

/** The saved listings, or null until they are known. */
export function useSavedIds(): ReadonlySet<string> | null {
  const ids = useSyncExternalStore(
    store.subscribe,
    store.snapshot,
    () => null, // the server has no opinion; the heart starts empty
  );

  useEffect(() => {
    void store.load();
  }, []);

  return ids;
}

/** Marks a listing saved or not, for every reader on the page at once. */
export function setSaved(listingId: string, favourited: boolean) {
  store.set(listingId, favourited);
}

/**
 * Whether a listing was taken off the saved list on this page: saved when
 * the page loaded, not saved now. False until the list is known, and if it
 * could not be fetched, so nothing disappears on a guess.
 */
export function unsavedHere(
  ids: ReadonlySet<string> | null,
  listingId: string,
): boolean {
  return (
    ids !== null && store.loaded?.has(listingId) === true && !ids.has(listingId)
  );
}

/**
 * The page's "watching" figure, moved by the heart beside it: one more
 * when this person saves the listing here, one fewer when they take it off.
 * Each heart is one person watching (`toggleFavourite`).
 */
export function useWatching(listingId: string, watching: number): number {
  const ids = useSavedIds();
  const before = store.loaded;
  if (!ids || !before) return watching;
  const change = Number(ids.has(listingId)) - Number(before.has(listingId));
  return Math.max(0, watching + change);
}
