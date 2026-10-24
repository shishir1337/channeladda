import {
  ArrowUpRightIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  InfoIcon,
  OctagonAlertIcon,
  SearchXIcon,
} from "lucide-react";
import Link from "next/link";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { InfoTip } from "@/components/app/info-tip";
import { iconText, iconTile } from "@/components/ui/icon-hue";
import { Price } from "@/components/ui/price";
import { cn } from "@/lib/utils";

/**
 * The one kit every dashboard page is built from — member, agent and staff.
 *
 * A tool is scanned, not read. So: one type family, true neutrals, hairline
 * borders instead of shadows, and colour only where it carries meaning — gold
 * when something is waiting on the reader, green, blue and red for status.
 * Every part here is quiet on purpose, so the one loud thing on a page (the
 * next action) is easy to find.
 */

export type Tone = "neutral" | "primary" | "verified" | "danger" | "info";
type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const DOT: Record<Tone, string> = {
  neutral: "bg-line-strong",
  primary: "bg-primary",
  verified: "bg-verified",
  danger: "bg-danger",
  info: "bg-info",
};

const SOFT: Record<Tone, string> = {
  neutral: "border-line bg-surface-2 text-muted",
  primary: "border-primary/25 bg-primary-soft text-primary-text",
  verified: "border-verified/20 bg-verified-soft text-verified",
  danger: "border-danger/20 bg-danger-soft text-danger",
  info: "border-info/20 bg-info-soft text-info",
};

/** Tinted fill without the border, for counts. */
const PILL: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted",
  primary: "bg-primary-soft text-primary-text",
  verified: "bg-verified-soft text-verified",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};

const TEXT: Record<Tone, string> = {
  neutral: "text-fg",
  primary: "text-primary-text",
  verified: "text-verified",
  danger: "text-danger",
  info: "text-info",
};

/** A small status dot. Never the only signal: it always sits beside words. */
export function Dot({
  tone = "neutral",
  pulse,
  className,
}: {
  tone?: Tone;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-1.5 shrink-0 rounded-full",
        DOT[tone],
        pulse && "animate-pulse-dot",
        className,
      )}
    />
  );
}

// ------------------------------------------------------------------ page

/**
 * Top of every page: what this is, one line on what it is for, and the
 * actions that belong to the whole page. The section you are in is already
 * in the top bar, so there is no eyebrow.
 */
export function PageHeader({
  title,
  description,
  info,
  actions,
  meta,
  back,
  className,
}: {
  title: ReactNode;
  /** One short line. Anything longer belongs in `info`. */
  description?: ReactNode;
  /** The longer explanation, behind an (i) beside the title. */
  info?: ReactNode;
  actions?: ReactNode;
  /** Short facts beside the title — a reference, an age, who holds it. */
  meta?: ReactNode;
  back?: { href: string; label: string };
  className?: string;
}) {
  return (
    <header
      className={cn(
        "mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {back ? (
          <Link
            href={back.href}
            className="group -ml-1 mb-1 inline-flex min-h-11 items-center gap-0.5 rounded-md px-1 text-[0.8125rem] text-muted transition-colors hover:text-fg pointer-fine:mb-2 pointer-fine:min-h-6"
          >
            <ChevronLeftIcon
              aria-hidden="true"
              className="size-3.5 transition-transform duration-150 group-hover:-translate-x-0.5"
            />
            {back.label}
          </Link>
        ) : null}
        <div className="flex items-center gap-2">
          <h1 className="text-xl leading-7 font-semibold tracking-[-0.018em] text-fg sm:text-[1.375rem]">
            {title}
          </h1>
          {info ? (
            <InfoTip
              label={`About ${typeof title === "string" ? title : "this page"}`}
            >
              {info}
            </InfoTip>
          ) : null}
        </div>
        {description ? (
          <p className="mt-1 max-w-[72ch] text-sm leading-relaxed text-muted">
            {description}
          </p>
        ) : null}
        {meta ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.8125rem] text-subtle">
            {meta}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}

/** One fact in a header's meta row. */
export function MetaItem({
  label,
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {label ? <span className="text-subtle">{label}</span> : null}
      <span className="font-medium text-muted">{children}</span>
    </span>
  );
}

/** A count beside a heading, so nobody has to count the rows. */
export function Count({
  value,
  tone = "neutral",
  label = "items",
}: {
  value: number;
  tone?: Tone;
  label?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium tabular-nums",
        value === 0 || tone === "neutral"
          ? "bg-surface-2 text-muted ring-1 ring-line ring-inset"
          : PILL[tone],
      )}
    >
      {value.toLocaleString("en-US")}
      <span className="sr-only"> {label}</span>
    </span>
  );
}

/**
 * A heading and what is under it. The count sits in the heading so a queue
 * says how long it is before anyone reads it; `tone` colours that count when
 * the queue needs somebody.
 */
export function Section({
  id,
  title,
  description,
  info,
  count,
  tone = "neutral",
  actions,
  children,
  className,
}: {
  id?: string;
  title?: ReactNode;
  /** One short line, or nothing. Anything longer belongs in `info`. */
  description?: ReactNode;
  /** The longer explanation, behind an (i) beside the heading. */
  info?: ReactNode;
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
      aria-labelledby={title ? headingId : undefined}
      className={cn("mt-10 first:mt-0", className)}
    >
      {title || actions ? (
        <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            {title ? (
              // The tip sits beside the heading rather than inside it, so
              // the heading — and the region it names — is just the title.
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  id={headingId}
                  className="flex flex-wrap items-center gap-2 text-[0.9375rem] leading-6 font-semibold text-fg"
                >
                  {title}
                  {typeof count === "number" ? (
                    <Count value={count} tone={tone} />
                  ) : null}
                </h2>
                {info ? (
                  <InfoTip
                    label={`About ${typeof title === "string" ? title : "this section"}`}
                  >
                    {info}
                  </InfoTip>
                ) : null}
              </div>
            ) : null}
            {description ? (
              <p className="mt-0.5 max-w-[80ch] text-[0.8125rem] leading-relaxed text-muted">
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
      ) : null}
      {children}
    </section>
  );
}

/** A quiet text link with an arrow, for "see all" beside a heading. */
export function SeeAll({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group inline-flex min-h-11 items-center gap-0.5 rounded-md text-[0.8125rem] font-medium text-muted transition-colors hover:text-fg pointer-fine:min-h-6"
    >
      {children}
      <ChevronRightIcon
        aria-hidden="true"
        className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5"
      />
    </Link>
  );
}

// -------------------------------------------------------------- surfaces

const CARD_TONE: Record<Tone, string> = {
  neutral: "border-line bg-surface",
  primary: "border-primary/35 bg-primary-soft/50",
  verified: "border-verified/25 bg-verified-soft/50",
  danger: "border-danger/30 bg-danger-soft/50",
  info: "border-info/25 bg-info-soft/50",
};

/**
 * The one raised plane. Cards never nest: a section is a heading and a card,
 * not a card of cards.
 */
export function Card({
  children,
  tone = "neutral",
  padded = false,
  className,
  id,
}: {
  children: ReactNode;
  tone?: Tone;
  padded?: boolean;
  className?: string;
  id?: string;
}) {
  return (
    <div
      id={id}
      className={cn(
        "rounded-card border shadow-xs",
        CARD_TONE[tone],
        padded && "p-3.5 sm:p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  icon: IconCmp,
  actions,
  info,
  as: Heading = "h3",
  id,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: Icon;
  /** The longer explanation, behind an (i) beside the title. */
  info?: ReactNode;
  actions?: ReactNode;
  /** h2 when the card is a page section of its own, with no Section above. */
  as?: "h2" | "h3";
  /** On the heading, for a surrounding `aria-labelledby`. */
  id?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 border-b border-line px-3.5 py-3 sm:px-5",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        {IconCmp ? (
          <IconCmp
            aria-hidden="true"
            className={cn("mt-0.5 size-4 shrink-0", iconText(IconCmp))}
          />
        ) : null}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Heading
              id={id}
              className="text-sm leading-6 font-semibold text-fg"
            >
              {title}
            </Heading>
            {info ? (
              <InfoTip
                label={`About ${typeof title === "string" ? title : "this card"}`}
              >
                {info}
              </InfoTip>
            ) : null}
          </div>
          {description ? (
            <p className="text-[0.8125rem] leading-relaxed text-muted">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

export function CardBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("p-3.5 sm:p-5", className)}>{children}</div>;
}

export function CardFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-b-[inherit] border-t border-line bg-surface-2/50 px-3.5 py-3 text-[0.8125rem] text-muted sm:px-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A small square that holds an icon at the start of a row or card. */
export function IconTile({
  icon: IconCmp,
  tone,
  size = "md",
  className,
}: {
  icon: Icon;
  /**
   * A status colour, when the tile says how something went (money in is
   * green). Left out, the tile takes the icon's own colour, so the same
   * icon looks the same on every page; "neutral" asks for grey.
   */
  tone?: Tone;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center border",
        tone === undefined
          ? iconTile(IconCmp, "border-line bg-surface text-muted shadow-xs")
          : tone === "neutral"
            ? "border-line bg-surface text-muted shadow-xs"
            : SOFT[tone],
        size === "sm" && "size-7 rounded-md [&_svg]:size-3.5",
        size === "md" && "size-8 rounded-lg [&_svg]:size-4",
        size === "lg" && "size-10 rounded-lg [&_svg]:size-[1.15rem]",
        className,
      )}
    >
      <IconCmp />
    </span>
  );
}

type CalloutTone = "neutral" | "info" | "warning" | "danger" | "success";

const CALLOUT: Record<CalloutTone, { box: string; icon: string; Icon: Icon }> =
  {
    neutral: {
      box: "border-line bg-surface",
      icon: "text-subtle",
      Icon: InfoIcon,
    },
    info: {
      box: "border-info/20 bg-info-soft/70",
      icon: "text-info",
      Icon: InfoIcon,
    },
    warning: {
      box: "border-primary/30 bg-primary-soft/80",
      icon: "text-primary-text",
      Icon: CircleAlertIcon,
    },
    danger: {
      box: "border-danger/25 bg-danger-soft/80",
      icon: "text-danger",
      Icon: OctagonAlertIcon,
    },
    success: {
      box: "border-verified/20 bg-verified-soft/80",
      icon: "text-verified",
      Icon: CircleCheckIcon,
    },
  };

/**
 * A message about the page rather than an item on it: confirm your email,
 * this deal is frozen, payouts are paused.
 */
export function Callout({
  tone = "neutral",
  icon,
  title,
  children,
  action,
  role,
  className,
}: {
  tone?: CalloutTone;
  icon?: Icon;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  /** "alert" for a failure that has just happened, "status" for news. */
  role?: "alert" | "status";
  className?: string;
}) {
  const style = CALLOUT[tone];
  const IconCmp = icon ?? style.Icon;
  return (
    <div
      role={role}
      className={cn(
        "flex flex-col gap-3 rounded-card border px-3.5 py-3.5 sm:flex-row sm:items-center",
        style.box,
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <IconCmp
          aria-hidden="true"
          className={cn("mt-0.5 size-4 shrink-0", style.icon)}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-5 font-medium text-fg">{title}</p>
          {children ? (
            <div className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted">
              {children}
            </div>
          ) : null}
        </div>
      </div>
      {action ? (
        <div className="flex shrink-0 items-center gap-2 pl-7 sm:pl-0">
          {action}
        </div>
      ) : null}
    </div>
  );
}

/**
 * An empty list. Always names the next step, because an empty screen is an
 * invitation to do something, not a dead end.
 */
export function EmptyState({
  icon = SearchXIcon,
  title,
  body,
  action,
  tone = "neutral",
  bare,
  as: Title = "p",
  info,
  className,
}: {
  icon?: Icon;
  title: ReactNode;
  /** The longer explanation, behind an (i) beside the title. */
  info?: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  tone?: "neutral" | "success";
  /** Inside a card that already has a border. */
  bare?: boolean;
  /** A heading when the empty state stands in for a section of the page. */
  as?: "p" | "h2" | "h3";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center px-6 py-12 text-center",
        !bare && "rounded-card border border-line bg-surface shadow-xs",
        className,
      )}
    >
      <IconTile
        icon={icon}
        size="lg"
        tone={tone === "success" ? "verified" : undefined}
      />
      <div className="mt-4 flex items-center justify-center gap-1.5">
        <Title className="text-sm font-semibold tracking-normal text-fg">
          {title}
        </Title>
        {info ? (
          <InfoTip
            label={`About ${typeof title === "string" ? title : "this"}`}
          >
            {info}
          </InfoTip>
        ) : null}
      </div>
      {body ? (
        <p className="mt-1 max-w-[46ch] text-[0.8125rem] leading-relaxed text-muted">
          {body}
        </p>
      ) : null}
      {action ? (
        <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>
      ) : null}
    </div>
  );
}

/**
 * A cleared queue. Finished work, said quietly — a line, not a banner.
 */
export function AllClear({
  title,
  body,
  className,
}: {
  title: ReactNode;
  body?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-card border border-line bg-surface px-3.5 py-3.5 shadow-xs",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="mt-px inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-verified-soft text-verified ring-1 ring-verified/20 ring-inset"
      >
        <CheckIcon className="size-3" strokeWidth={3} />
      </span>
      <div className="min-w-0">
        <p className="text-sm leading-5 font-medium text-fg">{title}</p>
        {body ? (
          <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted">
            {body}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("block animate-pulse rounded-md bg-surface-3", className)}
    />
  );
}

// ---------------------------------------------------------------- figures

export function StatGrid({
  children,
  columns = 4,
  className,
}: {
  children: ReactNode;
  columns?: 2 | 3 | 4 | 5;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3",
        columns === 3 && "lg:grid-cols-3",
        columns === 4 && "lg:grid-cols-4",
        columns === 5 && "lg:grid-cols-3 xl:grid-cols-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * One figure and what it counts.
 *
 * Neutral by default. `tone` is a dot beside the label — gold when it is
 * waiting on the reader — and only danger recolours the number itself. A
 * linked figure shows its arrow on hover so the whole card reads as a door.
 */
export function Stat({
  label,
  value,
  note,
  chip,
  tone = "neutral",
  href,
  icon: IconCmp,
  info,
  className,
}: {
  label: ReactNode;
  /** A number is formatted here; anything else is rendered as given. */
  value: ReactNode;
  /** A few words at most. What the figure means goes in `info`. */
  note?: ReactNode;
  /** What the figure counts and why, behind an (i) beside the label. */
  info?: ReactNode;
  chip?: ReactNode;
  tone?: Tone;
  href?: string;
  icon?: Icon;
  className?: string;
}) {
  // A linked figure is a box with a stretched link rather than a link
  // wrapping everything: the whole card still opens the page, and the info
  // tip — a button, which cannot sit inside a link — stays in the label row.
  return (
    <div
      className={cn(
        "group relative flex min-w-0 flex-col rounded-card border border-line bg-surface p-3.5 shadow-xs sm:p-4",
        href &&
          "transition-[border-color,background-color] duration-150 hover:border-line-strong hover:bg-surface-2/40 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-[0.8125rem] leading-5 font-medium text-muted">
        {tone !== "neutral" ? <Dot tone={tone} /> : null}
        {IconCmp ? (
          <IconCmp
            aria-hidden="true"
            className={cn("size-3.5 shrink-0", iconText(IconCmp))}
          />
        ) : null}
        {href ? (
          <Link
            href={href}
            className="min-w-0 [overflow-wrap:anywhere] outline-none after:absolute after:inset-0 after:rounded-[inherit] after:content-['']"
          >
            {label}
          </Link>
        ) : (
          <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
        )}
        {info ? (
          <InfoTip
            label={`About ${typeof label === "string" ? label : "this figure"}`}
            className="relative z-[1]"
          >
            {info}
          </InfoTip>
        ) : null}
        {href ? (
          <ArrowUpRightIcon
            aria-hidden="true"
            className="ml-auto size-3.5 shrink-0 text-subtle opacity-60 transition duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-fg group-hover:opacity-100"
          />
        ) : null}
      </div>
      <p
        className={cn(
          // A figure in a wide currency on a phone breaks rather than
          // running into the card beside it.
          "mt-2 text-[1.375rem] leading-7 font-semibold tracking-[-0.02em] [overflow-wrap:anywhere] tabular-nums sm:text-[1.625rem] sm:leading-8",
          tone === "danger" ? "text-danger" : "text-fg",
        )}
      >
        {typeof value === "number" ? value.toLocaleString("en-US") : value}
      </p>
      {chip ? <div className="relative mt-2">{chip}</div> : null}
      {note ? (
        <p className="mt-1 text-xs leading-snug text-subtle">{note}</p>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ lists

/** Rows sharing one border, so a page has fewer competing edges. */
export function List({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ul
      className={cn(
        "divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-xs",
        className,
      )}
    >
      {children}
    </ul>
  );
}

const ROW_HOVER = "transition-colors duration-150 hover:bg-surface-2/60";

/**
 * One row. With `href` the whole row is the link. `flag` marks a row that
 * needs attention with a stripe down its left edge.
 */
export function ListItem({
  children,
  href,
  flag,
  padded = true,
  className,
}: {
  children: ReactNode;
  href?: string;
  flag?: Tone;
  padded?: boolean;
  className?: string;
}) {
  const pad = padded && "px-3.5 py-3 sm:px-5";
  return (
    <li className={cn("relative", !href && pad, className)}>
      {flag ? (
        <span
          aria-hidden="true"
          className={cn("absolute inset-y-0 left-0 z-[1] w-0.5", DOT[flag])}
        />
      ) : null}
      {href ? (
        <Link
          href={href}
          className={cn(
            "group block focus-visible:-outline-offset-2",
            pad,
            ROW_HOVER,
          )}
        >
          {children}
        </Link>
      ) : (
        children
      )}
    </li>
  );
}

/**
 * The usual shape of a row: something to recognise it by, a title, a line
 * of detail, and whatever qualifies it on the right.
 */
export function ListRow({
  leading,
  title,
  meta,
  trailing,
  chevron,
}: {
  leading?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  /** Show a chevron — use inside a linked ListItem. */
  chevron?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      {leading}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm leading-5 font-medium text-fg">
          {title}
        </div>
        {meta ? (
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[0.8125rem] leading-5 text-muted">
            {meta}
          </div>
        ) : null}
      </div>
      {trailing ? (
        <div className="flex shrink-0 items-center gap-3">{trailing}</div>
      ) : null}
      {chevron ? (
        <ChevronRightIcon
          aria-hidden="true"
          className="size-4 shrink-0 text-subtle transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-muted"
        />
      ) : null}
    </div>
  );
}

/** A thin separator for a meta line: "Hannah · 3 days ago". */
export function Sep() {
  return (
    <span aria-hidden="true" className="text-line-strong">
      ·
    </span>
  );
}

// ----------------------------------------------------------------- tables

/**
 * Tables scroll inside this, never past the edge of the page.
 * `overscroll-x-contain` stops a swipe that runs out of table from becoming
 * a back gesture.
 */
export function TableCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "w-full overflow-x-auto overscroll-x-contain rounded-card border border-line bg-surface shadow-xs",
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
  children?: ReactNode;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "h-9 border-b border-line bg-surface-2/50 px-3 text-left text-xs font-medium whitespace-nowrap text-muted first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5",
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
  children?: ReactNode;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "px-3 py-3 align-middle text-sm first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5",
        numeric && "text-right tabular-nums",
        className,
      )}
    >
      {children}
    </td>
  );
}

/** A body row: hairline above, a hover wash. */
export function Tr({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <tr
      className={cn(
        "border-t border-line first:border-t-0",
        ROW_HOVER,
        className,
      )}
    >
      {children}
    </tr>
  );
}

// ---------------------------------------------------------------- filters

/**
 * Filters across the top of a list. Underlined tabs rather than pills: they
 * hold eight options with counts without turning into a row of buttons.
 */
export function FilterBar({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn(
        "no-scrollbar -mx-3 overflow-x-auto border-b border-line px-3 sm:mx-0 sm:px-0",
        className,
      )}
    >
      <div className="flex min-w-max items-center gap-x-5 sm:min-w-0 sm:flex-wrap">
        {children}
      </div>
    </nav>
  );
}

export function FilterLink({
  href,
  active,
  count,
  tone = "neutral",
  children,
}: {
  href: string;
  active: boolean;
  count?: number;
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative -mb-px inline-flex h-11 shrink-0 items-center gap-1.5 border-b-2 text-[0.8125rem] font-medium whitespace-nowrap transition-colors duration-150 pointer-fine:h-10",
        active
          ? "border-fg text-fg"
          : "border-transparent text-muted hover:border-line-strong hover:text-fg",
      )}
    >
      {children}
      {typeof count === "number" ? (
        <span
          className={cn(
            "inline-flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full px-1 text-[0.6875rem] font-medium tabular-nums",
            count > 0 && tone !== "neutral"
              ? PILL[tone]
              : active
                ? "bg-fg/10 text-fg"
                : "bg-surface-2 text-subtle",
          )}
        >
          {count.toLocaleString("en-US")}
        </span>
      ) : null}
    </Link>
  );
}

// ------------------------------------------------------------- key/value

export function Facts({
  children,
  columns = 1,
  className,
}: {
  children: ReactNode;
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-8",
        // In two columns the last row has two cells; neither wants a rule.
        columns === 2 &&
          "sm:grid-cols-2 sm:[&>*:nth-last-child(2):nth-child(odd)]:border-b-0",
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
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 border-b border-line py-2.5 last:border-b-0",
        className,
      )}
    >
      <dt className="shrink-0 text-[0.8125rem] text-muted">{label}</dt>
      <dd
        className={cn(
          "min-w-0 text-right text-sm font-medium break-words tabular-nums",
          TEXT[tone],
        )}
      >
        {children}
      </dd>
    </div>
  );
}

// ------------------------------------------------------------------ money

/**
 * An amount, and which pocket it is in. Every figure in the database is
 * integer cents and `Price` takes dollars, so the conversion happens here.
 */
export function Amount({
  cents,
  caption,
  size = "md",
  tone = "neutral",
  exact,
  className,
}: {
  /** Integer cents, exactly as stored. */
  cents: number;
  caption?: string;
  size?: "sm" | "md" | "lg";
  tone?: Tone;
  exact?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex flex-col items-end", className)}>
      <Price
        usd={cents / 100}
        exact={exact}
        className={cn(
          "font-medium tabular-nums",
          size === "lg" && "text-lg font-semibold tracking-[-0.01em]",
          size === "md" && "text-sm",
          size === "sm" && "text-xs",
          TEXT[tone],
        )}
      />
      {caption ? (
        <span className="mt-0.5 text-xs text-subtle">{caption}</span>
      ) : null}
    </span>
  );
}

/** A deal or payout reference. Monospaced, because it gets read aloud. */
export function Reference({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-line bg-surface-2 px-1.5 py-px font-mono text-[0.6875rem] leading-4 text-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}

// ------------------------------------------------------------------ turns

/**
 * Whose move it is. The whole product is turn-taking, so this is the one
 * piece of state worth repeating everywhere — and the one that earns gold.
 */
export function TurnFlag({ mine, who }: { mine: boolean; who?: string }) {
  if (mine) {
    return (
      <span className="inline-flex h-5 items-center gap-1.5 rounded-full bg-primary-soft px-2 text-xs font-medium whitespace-nowrap text-primary-text ring-1 ring-primary/25 ring-inset">
        <Dot tone="primary" pulse />
        Your move
      </span>
    );
  }
  return (
    <span className="text-xs whitespace-nowrap text-subtle">
      With {who ?? "them"}
    </span>
  );
}

// ----------------------------------------------------------------- fields

/**
 * For inputs, selects and textareas a page builds itself, so they match
 * `TextField`: 36px on a fine pointer, 44px under a finger, 16px text on a
 * phone so iOS does not zoom, and a soft gold ring on focus.
 */
export const fieldClass =
  "block w-full rounded-lg border border-line bg-surface px-3 text-base text-fg shadow-xs transition-[border-color,box-shadow] duration-150 placeholder:text-subtle hover:border-line-strong focus:border-primary focus:ring-[3px] focus:ring-primary/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/15 sm:text-sm dark:bg-surface-2";

/** `fieldClass` plus the height, for single-line inputs and selects. */
export const inputClass = `${fieldClass} h-11 pointer-fine:h-9`;

/** `fieldClass` for prose. */
export const textareaClass = `${fieldClass} min-h-24 resize-y py-2 leading-relaxed`;

export const labelClass = "block text-[0.8125rem] font-medium text-fg";

export const hintClass = "mt-1 text-xs leading-relaxed text-subtle";

// ----------------------------------------------------------------- visuals

const BAR: Record<Tone | "muted", string> = {
  neutral: "bg-fg/80",
  primary: "bg-primary",
  verified: "bg-verified",
  danger: "bg-danger",
  info: "bg-info",
  // Solid grey, darker than the track, so a grey part never reads as the
  // empty end of a half-full bar.
  muted: "bg-muted/55",
};

const STROKE: Record<Tone, string> = {
  neutral: "stroke-fg",
  primary: "stroke-primary",
  verified: "stroke-verified",
  danger: "stroke-danger",
  info: "stroke-info",
};

/** How full something is, as a thin bar. Say what it measures in `label`. */
export function Meter({
  value,
  max,
  label,
  tone = "neutral",
  className,
}: {
  value: number;
  max: number;
  label: string;
  tone?: Tone;
  className?: string;
}) {
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div className={cn("relative", className)}>
      {/* The native element is what a screen reader hears; the bar is drawn. */}
      <meter
        className="sr-only"
        aria-label={label}
        min={0}
        max={100}
        value={Math.round(share * 100)}
      >
        {Math.round(share * 100)}%
      </meter>
      <div
        aria-hidden="true"
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500 ease-[var(--ease-out-soft)]",
            BAR[tone],
          )}
          style={{ width: `${share * 100}%` }}
        />
      </div>
    </div>
  );
}

/**
 * A whole and its parts — where the money is, how the queue splits — as one
 * bar and a legend, so the proportion is seen before any figure is read.
 */
export function SplitBar({
  parts,
  label,
  className,
}: {
  parts: {
    label: ReactNode;
    value: number;
    /** What the legend prints; defaults to the number. */
    display?: ReactNode;
    tone?: Tone | "muted";
  }[];
  /** What the bar shows, for a screen reader. */
  label: string;
  className?: string;
}) {
  const total = parts.reduce((sum, part) => sum + Math.max(0, part.value), 0);
  return (
    <div className={className}>
      <div
        aria-hidden="true"
        className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-surface-3"
      >
        {total > 0
          ? parts
              .filter((part) => part.value > 0)
              .map((part, index) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and static
                  key={index}
                  className={cn(
                    "h-full min-w-1 first:rounded-l-full last:rounded-r-full",
                    BAR[part.tone ?? "neutral"],
                  )}
                  style={{ flexGrow: part.value }}
                />
              ))
          : null}
      </div>
      <ul
        aria-label={label}
        className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs"
      >
        {parts.map((part, index) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and static
            key={index}
            className="inline-flex items-center gap-1.5 text-muted"
          >
            <span
              aria-hidden="true"
              className={cn(
                "size-2 shrink-0 rounded-[3px]",
                BAR[part.tone ?? "neutral"],
              )}
            />
            {part.label}
            <span className="font-medium text-fg tabular-nums">
              {part.display ??
                (typeof part.value === "number"
                  ? part.value.toLocaleString("en-US")
                  : part.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Progress as a small ring, with whatever fits in the middle. */
export function Ring({
  value,
  max,
  label,
  tone = "primary",
  size = 40,
  children,
}: {
  value: number;
  max: number;
  label: string;
  tone?: Tone;
  size?: number;
  children?: ReactNode;
}) {
  const stroke = Math.max(3, Math.round(size / 10));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        aria-hidden="true"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-surface-3"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - share)}
          className={cn(
            "transition-[stroke-dashoffset] duration-700 ease-[var(--ease-out-soft)]",
            STROKE[tone],
          )}
        />
      </svg>
      {children ? (
        <span
          aria-hidden="true"
          className="absolute text-[0.6875rem] font-semibold text-fg tabular-nums"
        >
          {children}
        </span>
      ) : null}
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * "How this works", folded away. For the explanation a newcomer needs once
 * and a regular never reads again.
 */
export function Disclosure({
  title,
  children,
  bare,
  className,
}: {
  title: ReactNode;
  children: ReactNode;
  /** A text toggle with no card around it. */
  bare?: boolean;
  className?: string;
}) {
  return (
    <details
      className={cn(
        "group",
        !bare && "rounded-card border border-line bg-surface shadow-xs",
        className,
      )}
    >
      <summary
        className={cn(
          "flex min-h-11 cursor-pointer list-none items-center gap-2 text-[0.8125rem] font-medium text-muted transition-colors select-none hover:text-fg pointer-fine:min-h-9 [&::-webkit-details-marker]:hidden",
          !bare && "justify-between px-3.5 sm:px-5",
          bare && "w-fit",
        )}
      >
        {title}
        <ChevronRightIcon
          aria-hidden="true"
          className="size-3.5 shrink-0 transition-transform duration-200 group-open:rotate-90"
        />
      </summary>
      <div
        className={cn(
          "animate-app-in text-[0.8125rem] leading-relaxed text-muted",
          !bare && "border-t border-line px-3.5 py-3.5 sm:px-5",
          bare && "pt-1 pb-2",
        )}
      >
        {children}
      </div>
    </details>
  );
}
