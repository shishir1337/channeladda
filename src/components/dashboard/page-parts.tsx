import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The shared vocabulary for dashboard pages.
 *
 * A tool is scanned and operated, not read top to bottom, so these lean on
 * information design rather than typography: the summary comes before the
 * detail, and state is carried by shape as well as by colour.
 */

export function PageHead({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-black tracking-tight text-fg sm:text-[1.75rem]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-[60ch] text-sm leading-relaxed text-muted">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2.5">{actions}</div> : null}
    </div>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mt-8 first:mt-0", className)}>
      {title ? (
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-fg">
              {title}
            </h2>
            {description ? (
              <p className="mt-0.5 text-sm text-muted">{description}</p>
            ) : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** A card. One raised plane above the page, never two nested. */
export function Panel({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-panel border border-line bg-surface",
        padded && "p-5 sm:p-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

type Tone = "neutral" | "primary" | "verified" | "danger" | "info";

const TONE_VALUE: Record<Tone, string> = {
  neutral: "text-fg",
  primary: "text-primary-text",
  verified: "text-verified",
  danger: "text-danger",
  info: "text-info",
};

const TONE_PANEL: Record<Tone, string> = {
  neutral: "border-line bg-surface",
  primary: "border-primary/35 bg-primary-soft",
  verified: "border-verified/30 bg-verified-soft",
  danger: "border-danger/30 bg-danger-soft",
  info: "border-info/30 bg-info-soft",
};

/**
 * One figure and what it means.
 *
 * `tone` is the semantic layer, kept separate from the brand accent: a number
 * turns gold because someone is waiting, not because it is important to us.
 */
export function Stat({
  label,
  value,
  note,
  tone = "neutral",
  href,
}: {
  label: string;
  value: string | number;
  note?: string;
  tone?: Tone;
  href?: string;
}) {
  const body = (
    <>
      <p className="font-mono text-[0.625rem] font-semibold tracking-[0.12em] text-subtle uppercase">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 font-display text-[1.75rem] leading-none font-black tabular-nums",
          TONE_VALUE[tone],
        )}
      >
        {typeof value === "number" ? value.toLocaleString("en-US") : value}
      </p>
      {note ? <p className="mt-1.5 text-xs text-subtle">{note}</p> : null}
    </>
  );

  const className = cn(
    "block rounded-panel border p-4 transition-colors sm:p-5",
    TONE_PANEL[tone],
    href && "hover:border-line-strong",
    href && tone === "primary" && "hover:border-primary",
  );

  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
  );
}

/** A list of rows sharing one border, so the page has fewer competing edges. */
export function Rows({ children }: { children: ReactNode }) {
  return (
    <ul className="grid gap-px overflow-hidden rounded-panel border border-line bg-line">
      {children}
    </ul>
  );
}

export function Row({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <li className={cn("bg-surface", className)}>{children}</li>;
}

/**
 * An empty screen is an invitation to act, so it always names the next step.
 */
export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-panel border border-dashed border-line bg-surface px-6 py-12 text-center">
      <h3 className="font-display text-base font-bold text-fg">{title}</h3>
      <p className="mx-auto mt-2 max-w-[44ch] text-sm leading-relaxed text-muted">
        {body}
      </p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

/**
 * Says who the next move belongs to.
 *
 * The whole product is turn-taking — an offer, a listing in review, a handover
 * — so this is the one piece of state worth repeating everywhere.
 */
export function TurnFlag({ mine, who }: { mine: boolean; who?: string }) {
  if (mine) {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[0.6875rem] font-semibold tracking-wide text-primary-text uppercase">
        <span
          aria-hidden="true"
          className="size-1.5 animate-pulse-dot rounded-full bg-primary"
        />
        Your move
      </span>
    );
  }
  return (
    <span className="font-mono text-[0.6875rem] tracking-wide text-subtle uppercase">
      With {who ?? "them"}
    </span>
  );
}
