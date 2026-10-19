import { ArrowUpRightIcon, ChevronLeftIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { platformMap } from "@/data/platforms";
import type { Platform } from "@/generated/prisma/enums";
import { channelLink } from "@/lib/channel-link";
import { cn } from "@/lib/utils";

/** The fixtures key platforms in lower case; the database in upper. */
function toPlatformId(platform: Platform) {
  return platform.toLowerCase() as keyof typeof platformMap;
}

/** The account on its own platform, for `ThreadHeader`, when its link checks out. */
export function channelOf(platform: Platform, sourceUrl: string | null) {
  const link = channelLink(platform, sourceUrl);
  return link ? { ...link, platform } : null;
}

/**
 * Small pieces the inbox, the thread and the staff desk draw with, so the
 * member and staff sides of a conversation look like one tool. No hooks
 * here: server pages and client components import them alike.
 */

/**
 * Up to two initials. "and" is skipped, so the agent's and staff's
 * "Rafi and Nadia" reads as the two people rather than "RA".
 */
function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter((word) => word && word.toLowerCase() !== "and")
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/** A person, by their initials — the same quiet disc as the account menu. */
export function Initials({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-linear-to-b from-surface-2 to-surface-3 text-[0.6875rem] font-semibold text-fg ring-1 ring-line ring-inset select-none",
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

/**
 * A button label that keeps its width when it swaps to its busy wording.
 * Both wordings are laid out in the same cell and only one is visible, so
 * "Send" turning into "Sending…" does not nudge the buttons beside it.
 */
export function BusyLabel({
  busy,
  idle,
  working,
}: {
  busy: boolean;
  idle: ReactNode;
  working: ReactNode;
}) {
  return (
    <span className="inline-grid justify-items-center">
      <span aria-hidden="true" className="invisible col-start-1 row-start-1">
        {idle}
      </span>
      <span aria-hidden="true" className="invisible col-start-1 row-start-1">
        {working}
      </span>
      <span className="col-start-1 row-start-1">{busy ? working : idle}</span>
    </span>
  );
}

/**
 * The bar across the top of a conversation: who it is with, which listing it
 * is about, and — when there is one — where the deal stands. Shared by the
 * member thread and the staff thread so the two read the same way.
 */
export function ThreadHeader({
  back,
  people,
  title,
  listing,
  channel,
  record,
  meta,
  actions,
}: {
  /** `phoneOnly`: on a computer the inbox rail is already beside it. */
  back?: { href: string; label: string; phoneOnly?: boolean };
  /** One name for the other side; two when the reader is neither side. */
  people: string[];
  title: ReactNode;
  listing: { href: string; handle: string; title: string };
  /**
   * The account itself, on its own platform: a link checked by
   * `channelLink`, never the raw URL the seller typed.
   */
  channel?: { href: string; label: string; platform: Platform } | null;
  /** The other side's completed deals, read before agreeing to anything. */
  record?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  const brand = channel ? platformMap[toPlatformId(channel.platform)] : null;
  return (
    // Pinned under the app bar (h-14) on a computer: in a long conversation
    // the one thing that must not scroll away is who it is with and where the
    // deal stands. Not on a phone, where every line it pinned was a line of
    // conversation lost; there it scrolls away and the message box stays.
    <header className="-mt-3 border-b border-line pt-1 pb-3 lg:sticky lg:top-14 lg:z-10 lg:-mt-4 lg:bg-bg/85 lg:pt-4 lg:backdrop-blur-xl lg:backdrop-saturate-150">
      {back && !back.phoneOnly ? (
        <Link
          href={back.href}
          className={cn(
            "group -ml-1 mb-2 inline-flex min-h-11 items-center gap-0.5 rounded-md px-1 text-[0.8125rem] text-muted transition-colors duration-150 hover:text-fg pointer-fine:min-h-7",
            back.phoneOnly && "lg:hidden",
          )}
        >
          <ChevronLeftIcon
            aria-hidden="true"
            className="size-3.5 transition-transform duration-150 group-hover:-translate-x-0.5"
          />
          {back.label}
        </Link>
      ) : null}

      {/* One row on anything wider than a phone: who, then where the deal
          stands and the way to it, on the right. A second row for the
          status cost the conversation a line of every screen. */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          {/* On a phone the way back sits beside the name rather than on a
              line of its own; on a computer the inbox is already beside it. */}
          {back?.phoneOnly ? (
            <Link
              href={back.href}
              aria-label={back.label}
              className="-ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg lg:hidden"
            >
              <ChevronLeftIcon aria-hidden="true" className="size-5" />
            </Link>
          ) : null}
          {people.length > 1 ? (
            <span className="flex shrink-0 -space-x-2">
              <span className="rounded-full ring-2 ring-bg">
                <Initials name={people[0] ?? ""} className="size-8" />
              </span>
              <span className="rounded-full ring-2 ring-bg">
                <Initials name={people[1] ?? ""} className="size-8" />
              </span>
            </span>
          ) : (
            <Initials
              name={people[0] ?? ""}
              className="size-8 text-xs sm:size-9"
            />
          )}
          <div className="min-w-0">
            <h1 className="truncate text-[0.9375rem] leading-6 font-semibold text-fg sm:text-base sm:break-words sm:whitespace-normal">
              {title}
            </h1>
            <Link
              href={listing.href}
              className="group inline-flex max-w-full items-center gap-1 text-[0.8125rem] leading-5 text-muted transition-colors duration-150 hover:text-fg"
            >
              <span className="truncate">
                {listing.handle} · {listing.title}
              </span>
              <ArrowUpRightIcon
                aria-hidden="true"
                className="size-3.5 shrink-0 text-subtle transition duration-150 group-hover:translate-x-px group-hover:-translate-y-px group-hover:text-fg"
              />
            </Link>
            {record ? (
              <p className="truncate text-xs leading-5 text-muted">{record}</p>
            ) : null}
          </div>
        </div>
        {meta || actions || channel ? (
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 sm:shrink-0 sm:justify-end">
            {meta ? (
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-subtle">
                {meta}
              </div>
            ) : null}
            {channel && brand ? (
              <a
                href={channel.href}
                target="_blank"
                // nofollow: a seller's channel is not something we vouch for
                // to search engines; noreferrer keeps the thread's URL to us.
                rel="noopener noreferrer nofollow"
                aria-label={`${channel.label} (opens in a new tab)`}
                title={channel.label}
                className="group inline-flex h-11 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[0.8125rem] font-medium text-fg shadow-xs transition-colors duration-150 hover:border-line-strong hover:bg-surface-2 pointer-fine:h-8 pointer-fine:px-2.5 dark:bg-surface-2 dark:hover:bg-surface-3"
              >
                <brand.icon
                  aria-hidden="true"
                  className="size-4 shrink-0"
                  style={{ color: brand.tint }}
                />
                {brand.name}
                <ArrowUpRightIcon
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-subtle transition duration-150 group-hover:translate-x-px group-hover:-translate-y-px group-hover:text-fg"
                />
              </a>
            ) : null}
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}
