import { LoaderCircleIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A button label that keeps the button's width while its action runs.
 *
 * The idle label and the busy one are stacked in the same grid cell and
 * only one is visible, so the button is always as wide as the wider of the
 * two and a row of buttons never jumps. The hidden one is `invisible`, which
 * also takes it out of the accessible name.
 *
 * The same as the deal timeline's, on its own: the listing page's "Ask the
 * seller" imported it from there, and with it every deal sentence on the
 * site — a 58 KB script on the page buyers land on from search.
 */
export function BusyLabel({
  busy,
  busyText,
  children,
}: {
  busy: boolean;
  busyText: string;
  children: ReactNode;
}) {
  return (
    <span className="inline-grid gap-[inherit] *:col-start-1 *:row-start-1">
      <span
        className={cn(
          "inline-flex items-center justify-center gap-[inherit]",
          busy && "invisible",
        )}
      >
        {children}
      </span>
      <span
        className={cn(
          "inline-flex items-center justify-center gap-[inherit]",
          !busy && "invisible",
        )}
      >
        <LoaderCircleIcon
          aria-hidden="true"
          className={cn(busy && "animate-spin")}
        />
        {busyText}
      </span>
    </span>
  );
}
