import Link from "next/link";
import { Dot } from "@/components/app/kit";
import { cn } from "@/lib/utils";

export type ListingTab = {
  listingId: string;
  title: string;
  /** The deal on it here, e.g. CA-40218, when there is one. */
  reference: string | null;
  /** Something on it is waiting for the reader. */
  yourMove: boolean;
  href: string;
};

/**
 * Two deals in one chat: one tab for each listing with something going on,
 * above the deal panel, so the reader can switch between them.
 *
 * Links rather than buttons — each one is the thread opened on that listing
 * (`?about=`), so it survives a reload and can be shared. Replace, not push,
 * and no scroll: switching is not somewhere new to come back from. A dot
 * marks a listing where it is the reader's move.
 *
 * Two tabs share the strip's width, each title cut short to fit, so the
 * second is never half hidden in the deal's narrow column. More than two
 * scroll sideways rather than wrap, with the next one peeking in and the
 * edge faded where there is more to see. `relative` keeps the screen-reader
 * text inside the strip: placed against the page instead, it stretched the
 * page to ~2,200px wide.
 */
export function ListingTabs({
  tabs,
  current,
}: {
  tabs: ListingTab[];
  current: string | null;
}) {
  return (
    <nav
      aria-label="Deals in this chat"
      className="no-scrollbar scroll-fade-x @container relative -mx-3 mb-3 overflow-x-auto px-3 sm:mx-0 sm:px-0"
    >
      <ul className="flex w-max min-w-full gap-0.5 rounded-xl border border-line bg-surface-2 p-1">
        {tabs.map((tab) => {
          const active = tab.listingId === current;
          return (
            <li
              key={tab.listingId}
              className={cn(
                "min-w-0 flex-1",
                // Two share the width; with more, a third peeks in at the
                // edge, so the strip plainly scrolls.
                tabs.length > 2
                  ? "max-w-[min(16rem,42cqw)]"
                  : "max-w-[min(16rem,calc(50cqw-0.375rem))]",
              )}
            >
              <Link
                href={tab.href}
                replace
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 w-full min-w-0 items-center justify-center gap-1.5 rounded-lg px-3 text-[0.8125rem] font-medium whitespace-nowrap transition-colors duration-150 pointer-fine:min-h-9",
                  active
                    ? "bg-surface text-fg shadow-xs ring-1 ring-line dark:bg-surface-3"
                    : "text-muted hover:text-fg",
                )}
              >
                {/* In a narrow strip the reference goes under the title,
                    which then has the tab's width rather than a few
                    letters of it. */}
                <span className="flex min-w-0 items-baseline gap-1.5 @max-md:flex-col @max-md:items-center @max-md:gap-0">
                  <span className="max-w-full truncate @max-md:leading-4">
                    {tab.title}
                  </span>
                  {tab.reference ? (
                    <span className="shrink-0 text-xs font-normal text-subtle tabular-nums @max-md:leading-4">
                      <span aria-hidden="true" className="@max-md:hidden">
                        ·{" "}
                      </span>
                      {tab.reference}
                    </span>
                  ) : null}
                </span>
                {tab.yourMove ? (
                  <>
                    <Dot tone="primary" pulse className="ml-0.5" />
                    <span className="sr-only">, your move</span>
                  </>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
