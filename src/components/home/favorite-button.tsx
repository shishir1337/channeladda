"use client";

import { HeartIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { setSaved, useSavedIds } from "@/components/home/saved-store";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

/**
 * Save a listing for later.
 *
 * Optimistic: the heart fills immediately and rolls back if the write fails,
 * because waiting on a round trip to colour an icon feels broken.
 */
export function FavoriteButton({
  listingId,
  handle,
  on = "cover",
}: {
  listingId: string;
  handle: string;
  /** Over cover art it needs a scrim; on a panel it is a quiet control. */
  on?: "cover" | "surface";
}) {
  const saved = useSavedIds()?.has(listingId) ?? false;
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
    setSaved(listingId, next); // optimistic
    setBusy(true);
    try {
      const res = await fetch("/api/favourites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId }),
      });
      if (!res.ok) throw new Error("save failed");
      const data = (await res.json()) as { favourited?: boolean };
      setSaved(listingId, data.favourited ?? next);
    } catch {
      setSaved(listingId, !next); // put it back
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
        on === "surface"
          ? cn(
              "border border-line hover:bg-surface-2",
              saved ? "text-danger" : "text-muted hover:text-fg",
            )
          : saved
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
