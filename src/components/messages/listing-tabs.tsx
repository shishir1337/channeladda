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
 * marks a listing where it is the reader's move. On a phone the strip
 * scrolls sideways rather than wrapping.
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
      className="no-scrollbar -mx-3 mb-3 overflow-x-auto px-3 sm:mx-0 sm:px-0"
    >
      <ul className="flex w-max min-w-full gap-0.5 rounded-xl border border-line bg-surface-2 p-1">
        {tabs.map((tab) => {
          const active = tab.listingId === current;
          return (
            <li key={tab.listingId} className="min-w-0 flex-1">
              <Link
                href={tab.href}
                replace
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 w-full max-w-[16rem] min-w-0 items-center justify-center gap-1.5 rounded-lg px-3 text-[0.8125rem] font-medium whitespace-nowrap transition-colors duration-150 pointer-fine:min-h-9",
                  active
                    ? "bg-surface text-fg shadow-xs ring-1 ring-line dark:bg-surface-3"
                    : "text-muted hover:text-fg",
                )}
              >
                <span className="truncate">{tab.title}</span>
                {tab.reference ? (
                  <span className="shrink-0 text-xs font-normal text-subtle tabular-nums">
                    · {tab.reference}
                  </span>
                ) : null}
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
