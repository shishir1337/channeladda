"use client";

import { HourglassIcon } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { countdownParts, formatCountdown } from "@/lib/deal-waits";
import { cn } from "@/lib/utils";

const exactDate = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * The clock a deal is waiting on, as a flip clock both sides can see.
 *
 * The owner asked for "an actual countdown, with minutes and seconds
 * flipping", in the chat and above all on a phone: so it ticks every second
 * and each unit is a split-flap card (styles in globals.css). The server
 * renders the figures from its own clock; the first tick in the browser
 * corrects any drift, which is why the digits are exempt from the
 * hydration check. Screen readers get one quiet line instead of the cards.
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
    // On the second boundary, so every card turns together.
    const id = window.setTimeout(
      () => setNow(Date.now()),
      1000 - (Date.now() % 1000),
    );
    return () => window.clearTimeout(id);
  }, [left]);

  const parts = countdownParts(left);

  return (
    <div
      className={cn(
        "rounded-card border border-line bg-surface p-3.5 shadow-xs",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted">
          <HourglassIcon aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </p>
        <time
          dateTime={new Date(end).toISOString()}
          className="shrink-0 text-xs text-subtle tabular-nums"
          suppressHydrationWarning
        >
          {exactDate.format(end)}
        </time>
      </div>

      <span className="sr-only" suppressHydrationWarning>
        {left > 0 ? `in ${formatCountdown(left)}` : "any moment now"}
      </span>

      {left > 0 ? (
        <div
          aria-hidden="true"
          className={cn(
            "mt-3 grid gap-2",
            parts.length === 4 ? "grid-cols-4" : "grid-cols-3",
          )}
        >
          {parts.map((part) => (
            <div key={part.unit} className="flex flex-col items-center gap-1">
              <span className="w-full max-w-[4.5rem]">
                <FlipCard value={part.value} />
              </span>
              <span className="text-[0.625rem] font-medium tracking-wider text-subtle uppercase">
                {part.unit}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-1.5 text-[0.9375rem] font-semibold text-fg">
          Any moment now
        </p>
      )}
    </div>
  );
}

/**
 * One split-flap card. When the value changes the old top half folds down
 * and the new bottom half unfolds; a new `turn` key restarts the fold.
 */
function FlipCard({ value }: { value: string }) {
  const [current, setCurrent] = useState(value);
  const [previous, setPrevious] = useState(value);
  const [turn, setTurn] = useState(0);

  // Following a prop by adjusting state while rendering, as React suggests,
  // rather than an effect that would paint the old figure for a frame.
  if (value !== current) {
    setPrevious(current);
    setCurrent(value);
    setTurn((n) => n + 1);
  }

  return (
    <span className="flip-card text-[1.625rem] font-semibold">
      <span className="flip-half flip-top" suppressHydrationWarning>
        {current}
      </span>
      <span className="flip-half flip-bottom" suppressHydrationWarning>
        {previous}
      </span>
      {turn > 0 ? (
        <Fragment key={turn}>
          <span className="flip-half flip-top flip-fold-top">{previous}</span>
          <span className="flip-half flip-bottom flip-fold-bottom">
            {current}
          </span>
        </Fragment>
      ) : null}
    </span>
  );
}
