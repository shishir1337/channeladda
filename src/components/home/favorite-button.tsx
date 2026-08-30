"use client";

import { HeartIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

/**
 * Which listings the person looking has saved.
 *
 * One fetch per page load, shared by every heart on it, rather than one
 * request per card. Kept in a module-level store so a browse page with
 * twenty-four cards asks once.
 */
const store = {
  ids: null as Set<string> | null,
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
    if (!store.ids) store.ids = new Set();
    if (favourited) store.ids.add(listingId);
    else store.ids.delete(listingId);
    store.emit();
  },
};

function useSaved(listingId: string) {
  const ids = useSyncExternalStore(
    store.subscribe,
    store.snapshot,
    () => null, // the server has no opinion; the heart starts empty
  );

  useEffect(() => {
    void store.load();
  }, []);

  return ids?.has(listingId) ?? false;
}

/**
 * Save a listing for later.
 *
 * Optimistic: the heart fills immediately and rolls back if the write fails,
 * because waiting on a round trip to colour an icon feels broken.
 */
export function FavoriteButton({
  listingId,
  handle,
}: {
  listingId: string;
  handle: string;
}) {
  const saved = useSaved(listingId);
  const { data: session } = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const toggle = useCallback(async () => {
    if (!session?.user) {
      // Nothing to save to yet. Send them to sign in and bring them back.
      router.push(
        `/signin?next=${encodeURIComponent(window.location.pathname)}`,
      );
      return;
    }
    if (busy) return;

    const next = !saved;
    store.set(listingId, next); // optimistic
    setBusy(true);
    try {
      const res = await fetch("/api/favourites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId }),
      });
      if (!res.ok) throw new Error("save failed");
      const data = (await res.json()) as { favourited?: boolean };
      store.set(listingId, data.favourited ?? next);
    } catch {
      store.set(listingId, !next); // put it back
    } finally {
      setBusy(false);
    }
  }, [busy, listingId, router, saved, session]);

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={
        saved ? `Remove ${handle} from saved` : `Save ${handle} for later`
      }
      onClick={toggle}
      className={cn(
        // z-10 keeps this above the card-wide link overlay. The scrim gives
        // the icon contrast over whatever cover art sits behind it.
        "relative z-10 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-200",
        saved
          ? "bg-black/55 text-danger backdrop-blur-sm"
          : "bg-black/40 text-white/80 backdrop-blur-sm hover:bg-black/65 hover:text-white",
      )}
    >
      <HeartIcon
        aria-hidden="true"
        className={cn(
          "size-[1.15rem] transition-transform duration-200",
          saved && "scale-110",
        )}
        fill={saved ? "currentColor" : "none"}
      />
    </button>
  );
}
