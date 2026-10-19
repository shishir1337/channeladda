"use client";

import { HourglassIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { formatCountdown } from "@/lib/deal-waits";
import { cn } from "@/lib/utils";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const exactDate = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * The clock a deal is waiting on, counting down where both sides can see it.
 *
 * Ticks every second in the last hour, when the seconds matter, and every
 * thirty above it, when they do not. The server renders the same text from
 * its own clock; the first tick in the browser corrects any drift, which is
 * why the figure itself is exempt from the hydration check.
 */
export function WaitCountdown({
  label,
  until,
  className,
}: {
  label: string;
  until: Date | string;
  className?: string;
}) {
  const end = new Date(until).getTime();
  const [now, setNow] = useState(() => Date.now());
  const left = end - now;

  useEffect(() => {
    if (left <= 0) return;
    const id = window.setTimeout(
      () => setNow(Date.now()),
      left < HOUR ? 1000 : 30_000,
    );
    return () => window.clearTimeout(id);
  }, [left]);

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-xs",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted ring-1 ring-line ring-inset"
      >
        <HourglassIcon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-subtle">{label}</p>
        <p className="text-[0.9375rem] leading-6 font-semibold text-fg tabular-nums">
          <span suppressHydrationWarning>
            {left > 0 ? `in ${formatCountdown(left)}` : "Any moment now"}
          </span>
        </p>
      </div>
      <time
        dateTime={new Date(end).toISOString()}
        className="shrink-0 text-right text-xs text-subtle tabular-nums"
        suppressHydrationWarning
      >
        {exactDate.format(end)}
      </time>
    </div>
  );
}
