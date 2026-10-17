import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon } from "lucide-react";
import Link from "next/link";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { Metric, type Tone } from "@/components/admin/console";
import { buttonVariants } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { cn } from "@/lib/utils";

/**
 * The pieces the money desk is drawn with.
 *
 * Built on the console primitives rather than beside them, so the desk reads
 * like every other staff page. The one addition is the exact figure: `Price`
 * shows whole units in whichever currency the header is set to, which is
 * right for a listing and wrong for a month-end report, so every money
 * figure here also carries its exact US-dollar amount underneath.
 */

/** Exact US dollars and cents from integer cents: 123456 → "US$1,234.56". */
export function exactUsd(cents: number): string {
  const formatted = (Math.abs(cents) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${cents < 0 ? "−" : ""}US$${formatted}`;
}

/**
 * One money figure, what it counts, and the exact amount.
 *
 * `note` is the one-line explanation, and it is not optional: a
 * non-technical owner reads these and acts on them, so a number without a
 * sentence saying what it counts is a number somebody will misread.
 */
export function MoneyMetric({
  label,
  cents,
  note,
  count,
  tone = "neutral",
  icon,
  href,
}: {
  label: string;
  /** Integer cents, exactly as summed from the ledger. */
  cents: number;
  note: ReactNode;
  /** e.g. "4 deals" — what the figure was summed over. */
  count?: string;
  tone?: Tone;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  href?: string;
}) {
  return (
    <Metric
      label={label}
      value={<Price usd={cents / 100} className="text-[1.4rem]" />}
      tone={tone}
      icon={icon}
      href={href}
      chip={
        <span className="tnum text-xs text-muted">
          {exactUsd(cents)}
          {count ? <span className="text-subtle"> · {count}</span> : null}
        </span>
      }
      note={note}
    />
  );
}

/** "1 deal", "3 deals". */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
}

type MonthOption = { key: string; label: string };

/**
 * Previous, a menu of recent months, next.
 *
 * A plain GET form, so it works without JavaScript and every month has a
 * URL somebody can bookmark or send to the accountant.
 */
export function MonthPicker({
  action,
  current,
  options,
  previous,
  next,
}: {
  action: string;
  current: MonthOption;
  options: readonly MonthOption[];
  previous: MonthOption;
  /** Null when `current` is this month: there is nothing after it yet. */
  next: MonthOption | null;
}) {
  const choices = options.some((o) => o.key === current.key)
    ? options
    : [current, ...options];

  const step =
    "inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-muted transition-colors";

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Link
        href={`${action}?month=${previous.key}`}
        aria-label={`Previous month, ${previous.label}`}
        className={cn(step, "hover:border-line-strong hover:text-fg")}
      >
        <ChevronLeftIcon aria-hidden="true" className="size-4" />
      </Link>
      <form method="get" action={action} className="flex items-end gap-2">
        <div>
          <label
            htmlFor="money-month"
            className="block text-xs font-medium text-muted"
          >
            Month (UTC)
          </label>
          <select
            id="money-month"
            name="month"
            defaultValue={current.key}
            className="mt-1 h-11 rounded-xl border border-line bg-surface px-3 text-base text-fg focus:border-primary/60 focus:outline-none sm:text-sm"
          >
            {choices.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          Show
        </button>
      </form>
      {next ? (
        <Link
          href={`${action}?month=${next.key}`}
          aria-label={`Next month, ${next.label}`}
          className={cn(step, "hover:border-line-strong hover:text-fg")}
        >
          <ChevronRightIcon aria-hidden="true" className="size-4" />
        </Link>
      ) : (
        <button
          type="button"
          disabled
          aria-label="Next month — this is the current month"
          className={cn(step, "cursor-not-allowed opacity-40")}
        >
          <ChevronRightIcon aria-hidden="true" className="size-4" />
        </button>
      )}
    </div>
  );
}

/**
 * A CSV download.
 *
 * A plain anchor, not `next/link`: the target is a route handler answering
 * with an attachment, and client-side navigation or prefetching it would
 * be wrong in both directions.
 */
export function DownloadLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      download
      className={buttonVariants({ variant: "secondary", size: "sm" })}
    >
      <DownloadIcon aria-hidden="true" className="size-4" />
      {children}
    </a>
  );
}
