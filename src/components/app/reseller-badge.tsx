import { GemIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The Reseller badge, beside a holder's name wherever the public sees it.
 *
 * Gold, because it is the one paid mark on the site and should read as a
 * distinction rather than a status; small, because it sits next to a name
 * that matters more. No hooks: server pages and client components draw it
 * alike.
 */
export function ResellerBadge({ className }: { className?: string }) {
  return (
    <span
      title="Reseller badge holder"
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-primary-soft px-2 font-sans text-[0.6875rem] leading-none font-semibold text-primary-text ring-1 ring-primary/25 ring-inset",
        className,
      )}
    >
      <GemIcon aria-hidden="true" className="size-3" />
      Reseller
    </span>
  );
}

/** "750 points", with the thousands marked. */
export function pointsLabel(points: number): string {
  return `${points.toLocaleString("en-US")} ${points === 1 ? "point" : "points"}`;
}
