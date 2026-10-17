import { CheckCircle2Icon, SearchXIcon } from "lucide-react";
import Link from "next/link";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { Price } from "@/components/ui/price";
import { cn } from "@/lib/utils";

/**
 * The parts an operations console is built from.
 *
 * Staff do not read these pages, they work them: find the thing that is
 * waiting, see how long it has waited, act, move on. So the vocabulary here
 * is deliberately dense — compact tiles, one-pixel row separators, tabular
 * figures — and every panel can say how many things are in it before you
 * start reading the rows.
 *
 * Kept inside `components/admin` rather than borrowed from the member
 * dashboard: the two areas answer different questions, and the staff side
 * needs ageing, queue counts and severity that a member never sees.
 */

export type Tone = "neutral" | "primary" | "verified" | "danger" | "info";

const TONE_SURFACE: Record<Tone, string> = {
  neutral: "border-line bg-surface",
  primary: "border-primary/35 bg-primary-soft",
  verified: "border-verified/30 bg-verified-soft",
  danger: "border-danger/35 bg-danger-soft",
  info: "border-info/30 bg-info-soft",
};

const TONE_VALUE: Record<Tone, string> = {
  neutral: "text-fg",
  primary: "text-primary-text",
  verified: "text-verified",
  danger: "text-danger",
  info: "text-info",
};

const TONE_RULE: Record<Tone, string> = {
  neutral: "bg-line-strong",
  primary: "bg-primary",
  verified: "bg-verified",
  danger: "bg-danger",
  info: "bg-info",
};

// ------------------------------------------------------------------ header

/**
 * Top of every staff page: where you are, what this desk is for, and the
 * handful of facts that belong next to the title rather than in a panel.
 */
export function ConsoleHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Short status facts — who is signed in, how many rows, when it was read. */
  meta?: ReactNode;
}) {
  return (
    <header className="border-b border-line pb-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="font-mono text-[0.625rem] font-semibold tracking-[0.14em] text-subtle uppercase">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="mt-1.5 font-display text-[1.6rem] leading-[1.1] font-black tracking-tight text-fg sm:text-[1.9rem]">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-muted">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
      {meta ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-subtle">
          {meta}
        </div>
      ) : null}
    </header>
  );
}

/** One fact in the header meta row, with its own separator. */
export function MetaItem({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-subtle/70">{label}</span>
      <span className="font-medium text-muted">{children}</span>
    </span>
  );
}

// ----------------------------------------------------------------- metrics

export function MetricGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * One figure, what it counts, and how stale the oldest of them is.
 *
 * A count alone is a dashboard. The `chip` slot — normally the age of the
 * oldest item — is what turns it into a queue you can triage.
 */
export function Metric({
  label,
  value,
  note,
  chip,
  tone = "neutral",
  href,
  icon: Icon,
}: {
  label: string;
  /** A number is formatted here; anything else is rendered as given. */
  value: ReactNode;
  note?: ReactNode;
  chip?: ReactNode;
  tone?: Tone;
  href?: string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
}) {
  const body = (
    <>
      <p className="flex items-center gap-1.5 font-mono text-[0.625rem] font-semibold tracking-[0.12em] text-subtle uppercase">
        {Icon ? (
          <Icon aria-hidden="true" className="size-3.5 shrink-0" />
        ) : null}
        <span className="min-w-0 truncate">{label}</span>
      </p>
      <p
        className={cn(
          "mt-2.5 font-display text-[1.6rem] leading-none font-black tabular-nums sm:text-[1.75rem]",
          TONE_VALUE[tone],
        )}
      >
        {typeof value === "number" ? value.toLocaleString("en-US") : value}
      </p>
      {chip ? <div className="mt-2">{chip}</div> : null}
      {note ? (
        <p className="mt-1.5 text-[0.6875rem] leading-snug text-subtle">
          {note}
        </p>
      ) : null}
    </>
  );

  const className = cn(
    "flex min-h-[5.75rem] flex-col rounded-card border p-3.5 transition-colors sm:p-4",
    TONE_SURFACE[tone],
    href && "hover:border-line-strong",
    href && tone === "primary" && "hover:border-primary",
    href && tone === "danger" && "hover:border-danger/60",
  );

  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

// ---------------------------------------------------------------- sections

/**
 * A worklist with a name.
 *
 * The count sits in the heading rather than being left for the reader to
 * work out from the rows, and `tone` lets a queue that needs attention
 * announce itself without borrowing the shape of a button.
 */
export function ConsoleSection({
  id,
  title,
  description,
  count,
  tone = "neutral",
  actions,
  children,
  className,
}: {
  id?: string;
  title: string;
  description?: ReactNode;
  count?: number;
  tone?: Tone;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn("mt-7", className)}
    >
      <div className="flex flex-wrap items-end justify-between gap-x-5 gap-y-2.5">
        <div className="min-w-0">
          <h2
            id={headingId}
            className="flex flex-wrap items-center gap-2.5 font-display text-base font-bold text-fg"
          >
            <span
              aria-hidden="true"
              className={cn(
                "h-4 w-[3px] shrink-0 rounded-full",
                TONE_RULE[tone],
              )}
            />
            {title}
            {typeof count === "number" ? (
              <span
                className={cn(
                  "tnum rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold",
                  count === 0
                    ? "border-line bg-surface-2 text-subtle"
                    : tone === "danger"
                      ? "border-danger/30 bg-danger-soft text-danger"
                      : tone === "primary"
                        ? "border-primary/30 bg-primary-soft text-primary-text"
                        : "border-line bg-surface-2 text-muted",
                )}
              >
                {count.toLocaleString("en-US")}
                <span className="sr-only"> items</span>
              </span>
            ) : null}
          </h2>
          {description ? (
            <p className="mt-1.5 max-w-[78ch] text-sm leading-relaxed text-muted">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
      <div className="mt-3.5">{children}</div>
    </section>
  );
}

/** A card. One raised plane above the page, never two nested. */
export function Panel({
  children,
  tone = "neutral",
  padded = true,
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  padded?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-card border",
        TONE_SURFACE[tone],
        padded && "p-4 sm:p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

// -------------------------------------------------------------------- rows

/** A list of rows sharing one border, so the page has fewer competing edges. */
export function Rows({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ul
      className={cn(
        "grid gap-px overflow-hidden rounded-card border border-line bg-line",
        className,
      )}
    >
      {children}
    </ul>
  );
}

/**
 * One row. `flag` paints a stripe down the left edge, which is how a row
 * that needs attention is marked without recolouring the whole row.
 */
export function RowItem({
  children,
  flag,
  className,
}: {
  children: ReactNode;
  flag?: Tone;
  className?: string;
}) {
  return (
    <li className={cn("relative bg-surface", className)}>
      {flag ? (
        <span
          aria-hidden="true"
          className={cn("absolute inset-y-0 left-0 w-[3px]", TONE_RULE[flag])}
        />
      ) : null}
      {children}
    </li>
  );
}

/** The identifying line of a row: title, then the tags that qualify it. */
export function RowHead({
  title,
  reference,
  tags,
  right,
}: {
  title: ReactNode;
  reference?: string;
  tags?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-fg">{title}</p>
        {tags ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {tags}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {reference ? (
          <span className="tnum text-[0.6875rem] text-subtle">{reference}</span>
        ) : null}
        {right}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ tables

/**
 * Tables scroll inside this, never past the edge of the page.
 *
 * `overscroll-x-contain` stops a swipe that runs out of table from turning
 * into a back gesture, which is the thing that makes a mobile data table feel
 * broken.
 */
export function TableScroller({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "w-full overflow-x-auto overscroll-x-contain rounded-card border border-line bg-surface",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Th({
  children,
  numeric,
  className,
}: {
  children: ReactNode;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "bg-surface-2 px-3 py-2.5 text-left font-mono text-[0.625rem] font-semibold tracking-[0.12em] whitespace-nowrap text-subtle uppercase first:pl-4 last:pr-4",
        numeric && "text-right",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  numeric,
  className,
}: {
  children: ReactNode;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "px-3 py-3 align-middle first:pl-4 last:pr-4",
        numeric && "tnum text-right",
        className,
      )}
    >
      {children}
    </td>
  );
}

// ------------------------------------------------------------------- money

/**
 * An amount, and what the amount is.
 *
 * Every figure in the database is integer cents and `Price` takes dollars, so
 * the conversion happens in one place and the caption says which pocket the
 * money is in — "buyer owes", "we hold", "to send". A column of bare numbers
 * on a finance screen is how the wrong one gets paid.
 */
export function Amount({
  cents,
  caption,
  size = "md",
  tone = "neutral",
  className,
}: {
  /** Integer cents, exactly as stored. */
  cents: number;
  caption?: string;
  size?: "sm" | "md" | "lg";
  tone?: Tone;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex flex-col items-end", className)}>
      <Price
        usd={cents / 100}
        className={cn(
          "font-semibold",
          size === "lg" && "font-display text-xl font-bold",
          size === "md" && "text-sm",
          size === "sm" && "text-xs",
          TONE_VALUE[tone],
        )}
      />
      {caption ? (
        <span className="mt-0.5 text-[0.625rem] tracking-wide text-subtle uppercase">
          {caption}
        </span>
      ) : null}
    </span>
  );
}

/** A deal or payout reference. Monospaced, because it gets read aloud. */
export function Reference({ children }: { children: ReactNode }) {
  return (
    <span className="tnum rounded-md bg-surface-2 px-1.5 py-0.5 text-[0.6875rem] text-muted">
      {children}
    </span>
  );
}

// ------------------------------------------------------------------- empty

/**
 * An empty queue is the goal, not a gap in the page.
 *
 * Shown in the verified tone with a tick, so a cleared desk reads as finished
 * work rather than as something that failed to load.
 */
export function AllClear({
  title,
  body,
  icon: Icon = CheckCircle2Icon,
}: {
  title: string;
  body: ReactNode;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
}) {
  return (
    <div className="flex items-start gap-3.5 rounded-card border border-verified/25 bg-verified-soft px-4 py-4 sm:px-5">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-surface/70 text-verified">
        <Icon aria-hidden="true" className="size-[1.1rem]" />
      </span>
      <div className="min-w-0">
        <p className="font-display text-sm font-bold text-fg">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
      </div>
    </div>
  );
}

/** Nothing to show, and that is neither good nor bad — a filter came back dry. */
export function Nothing({
  title,
  body,
  action,
  icon: Icon = SearchXIcon,
}: {
  title: string;
  body: ReactNode;
  action?: ReactNode;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
}) {
  return (
    <div className="rounded-card border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
      <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-surface-2 text-subtle">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <p className="mt-4 font-display text-sm font-bold text-fg">{title}</p>
      <p className="mx-auto mt-1.5 max-w-[46ch] text-sm leading-relaxed text-muted">
        {body}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

// ------------------------------------------------------------------ filters

/**
 * The filter strip, shared by every queue that has one.
 *
 * Four screens had four slightly different pill navs. One of them is enough,
 * and a count on each pill means you can see where the work is without
 * clicking through them.
 */
export function FilterBar({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <nav
      aria-label={label}
      className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0"
    >
      {children}
    </nav>
  );
}

export function FilterLink({
  href,
  active,
  count,
  children,
}: {
  href: string;
  active: boolean;
  count?: number;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium whitespace-nowrap transition-colors",
        active
          ? "border-primary bg-primary-soft text-primary-text"
          : "border-line bg-surface text-muted hover:border-line-strong hover:text-fg",
      )}
    >
      {children}
      {typeof count === "number" ? (
        <span
          className={cn(
            "tnum rounded-full px-1.5 text-[0.6875rem] font-semibold",
            active ? "bg-primary/20" : "bg-surface-2 text-subtle",
          )}
        >
          {count.toLocaleString("en-US")}
        </span>
      ) : null}
    </Link>
  );
}

// -------------------------------------------------------------------- dl

export function Facts({
  children,
  columns = 2,
  className,
}: {
  children: ReactNode;
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-0",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {children}
    </dl>
  );
}

export function Fact({
  label,
  children,
  tone = "neutral",
}: {
  label: string;
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 last:border-b-0">
      <dt className="text-xs text-subtle">{label}</dt>
      <dd
        className={cn(
          "text-sm font-medium tabular-nums",
          tone === "neutral" ? "text-fg" : TONE_VALUE[tone],
        )}
      >
        {children}
      </dd>
    </div>
  );
}
