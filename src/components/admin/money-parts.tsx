import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  LoaderCircleIcon,
} from "lucide-react";
import Link from "next/link";
import type { ComponentType, ReactNode, SVGProps } from "react";
import {
  Amount,
  IconTile,
  inputClass,
  ListItem,
  Stat,
  type Tone,
} from "@/components/app/kit";
import { buttonVariants } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { cn } from "@/lib/utils";

/**
 * The pieces the money desk is drawn with.
 *
 * Built on the app kit rather than beside it, so the desk reads like every
 * other staff page. The one addition is the exact figure: `Price` shows
 * whole units in whichever currency the header is set to, which is right
 * for a listing and wrong for a month-end report, so every money figure
 * here also carries its exact US-dollar amount underneath.
 */

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

/** Exact US dollars and cents from integer cents: 123456 → "US$1,234.56". */
export function exactUsd(cents: number): string {
  const formatted = (Math.abs(cents) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${cents < 0 ? "−" : ""}US$${formatted}`;
}

/** "1 deal", "3 deals". */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
}

/**
 * A link inside running text or a table cell — a person, a member. Quiet
 * at rest, underlined on hover: gold is kept for whatever is waiting on the
 * reader, and a desk full of gold names would bury it.
 */
export const linkClass =
  "font-medium text-fg underline decoration-line-strong underline-offset-4 transition-colors duration-150 hover:decoration-fg";

/**
 * A deal reference that opens the deal. Monospaced like every reference,
 * and underlined at rest because a bare code does not look like a link.
 */
export function RefLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="font-mono text-xs text-fg underline decoration-line-strong underline-offset-[3px] transition-colors duration-150 hover:decoration-fg"
    >
      {children}
    </Link>
  );
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
  className,
}: {
  label: string;
  /** Integer cents, exactly as summed from the ledger. */
  cents: number;
  note: ReactNode;
  /** e.g. "4 deals" — what the figure was summed over. */
  count?: string;
  tone?: Tone;
  icon?: Icon;
  href?: string;
  className?: string;
}) {
  return (
    <Stat
      label={label}
      value={<Price usd={cents / 100} />}
      tone={tone}
      icon={icon}
      href={href}
      className={className}
      // The exact figure sits tight under the rounded one, and the sentence
      // saying what it counts a step further down, so the two figures read
      // as one amount and the note as its definition.
      chip={
        <>
          <p className="-mt-1 text-[0.8125rem] text-muted tabular-nums">
            {exactUsd(cents)}
            {count ? <span className="text-subtle"> · {count}</span> : null}
          </p>
          <p className="mt-3 text-xs leading-relaxed text-subtle">{note}</p>
        </>
      }
    />
  );
}

/**
 * One movement of money over a period, as a row: what it is and what it
 * counts on the left, the amount — rounded, then exact — on the right.
 *
 * Rows rather than cards so the amounts line up in one column and read
 * down like a statement. Same contract as `MoneyMetric`: the note is not
 * optional.
 */
export function MoneyLine({
  label,
  cents,
  note,
  count,
  icon,
  href,
}: {
  label: string;
  /** Integer cents, exactly as summed from the ledger. */
  cents: number;
  note: ReactNode;
  count?: string;
  icon?: Icon;
  href?: string;
}) {
  return (
    <ListItem href={href}>
      <div className="flex items-start gap-3">
        {icon ? (
          <IconTile icon={icon} size="sm" className="hidden sm:inline-flex" />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-1.5 text-sm leading-5 font-medium text-fg">
            {label}
            {count ? (
              <span className="text-[0.8125rem] font-normal text-subtle tabular-nums">
                · {count}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 max-w-[64ch] text-xs leading-relaxed text-subtle">
            {note}
          </p>
        </div>
        <Amount cents={cents} caption={exactUsd(cents)} className="shrink-0" />
        {href ? (
          <ChevronRightIcon
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-subtle transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-muted"
          />
        ) : null}
      </div>
    </ListItem>
  );
}

/**
 * A button label that keeps the button's width while it works.
 *
 * Both labels share one grid cell and only one is visible, so the button is
 * as wide as the longer of the two and nothing beside it jumps when
 * "Recording…" replaces "Yes — add US$20.50". `visibility: hidden` also
 * keeps the hidden label out of the button's accessible name.
 */
export function BusyLabel({
  busy,
  label,
  busyLabel,
}: {
  busy: boolean;
  label: ReactNode;
  busyLabel: ReactNode;
}) {
  return (
    <span className="inline-grid">
      <span className={cn("col-start-1 row-start-1", busy && "invisible")}>
        {label}
      </span>
      <span
        className={cn(
          "col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5",
          !busy && "invisible",
        )}
      >
        <LoaderCircleIcon
          aria-hidden="true"
          className="size-3.5 animate-spin"
        />
        {busyLabel}
      </span>
    </span>
  );
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

  const step = buttonVariants({ variant: "secondary", size: "icon" });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href={`${action}?month=${previous.key}`}
        aria-label={`Previous month, ${previous.label}`}
        className={step}
      >
        <ChevronLeftIcon aria-hidden="true" className="size-4" />
      </Link>
      <form method="get" action={action} className="flex items-center gap-2">
        {/* The page says months run midnight to midnight UTC right beside
            this, so the label only needs to reach a screen reader. */}
        <label htmlFor="money-month" className="sr-only">
          Month (UTC)
        </label>
        <select
          id="money-month"
          name="month"
          defaultValue={current.key}
          className={cn(inputClass, "w-auto min-w-40 cursor-pointer")}
        >
          {choices.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className={buttonVariants({ variant: "secondary", size: "md" })}
        >
          Show
        </button>
      </form>
      {next ? (
        <Link
          href={`${action}?month=${next.key}`}
          aria-label={`Next month, ${next.label}`}
          className={step}
        >
          <ChevronRightIcon aria-hidden="true" className="size-4" />
        </Link>
      ) : (
        <button
          type="button"
          disabled
          aria-label="Next month — this is the current month"
          className={step}
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
      <DownloadIcon aria-hidden="true" />
      {children}
    </a>
  );
}
