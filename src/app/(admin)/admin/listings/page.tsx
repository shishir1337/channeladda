import { ImageIcon, StarIcon, TriangleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AllClear,
  ConsoleHeader,
  ConsoleSection,
  FilterBar,
  FilterLink,
  MetaItem,
  Nothing,
} from "@/components/admin/console";
import {
  elapsed,
  LISTING_STATUS,
  ListingStatusTag,
  Waited,
} from "@/components/admin/vocab";
import { Price } from "@/components/ui/price";
import type { ListingStatus } from "@/generated/prisma/enums";
import {
  getQueueCounts,
  getReviewQueue,
  NEWEST_FIRST,
  type QueueCounts,
} from "@/server/admin-listings";
import { requireStaff } from "@/server/session";

export const metadata: Metadata = {
  title: "Listing queue",
  robots: { index: false, follow: false },
};

/**
 * Every status a listing can sit in once its seller has let go of it.
 *
 * There used to be four. A listing taken down, paused, sold or in a deal was
 * on none of them, so the only way to find one was to already know its id —
 * which is how a takedown made in error became permanent.
 */
const TABS: { label: string; status: ListingStatus; key: keyof QueueCounts }[] =
  [
    { label: "For review", status: "ADMIN_REVIEW", key: "awaitingReview" },
    { label: "Placing code", status: "CODE_CHECK", key: "awaitingCode" },
    { label: "Live", status: "LIVE", key: "live" },
    { label: "In a deal", status: "RESERVED", key: "reserved" },
    { label: "Paused", status: "PAUSED", key: "paused" },
    { label: "Sent back", status: "REJECTED", key: "rejected" },
    { label: "Taken down", status: "REMOVED", key: "removed" },
    { label: "Sold", status: "SOLD", key: "sold" },
  ];

/** Hours a listing may sit in review before the row is marked. */
const WARN_AFTER = 12;
const LATE_AFTER = 24;

export default async function AdminListingsPage({
  searchParams,
}: PageProps<"/admin/listings">) {
  const staff = await requireStaff();
  const params = await searchParams;

  const requested = typeof params.status === "string" ? params.status : "";
  const active =
    TABS.find((t) => t.status === requested)?.status ?? "ADMIN_REVIEW";

  const [queue, counts] = await Promise.all([
    getReviewQueue(active),
    getQueueCounts(),
  ]);

  const reviewing = active === "ADMIN_REVIEW";
  // Ageing only means something in the review queue: on the other tabs the
  // timestamp is the last change, not the start of a wait.
  const late = reviewing
    ? queue.filter((item) => elapsed(item.waitingSince).hours >= LATE_AFTER)
        .length
    : 0;
  const noProof = queue.filter((item) => item.proofCount === 0).length;
  const oldest = queue.at(0)?.waitingSince;

  return (
    <>
      <ConsoleHeader
        eyebrow="Moderation"
        title="Listing queue"
        description="Worked oldest first, so nobody sits at the bottom for ever. Open a listing to see the ownership code, what the seller claims, and the proof they attached."
        meta={
          <>
            <MetaItem label="Signed in as">{staff.name}</MetaItem>
            {oldest && reviewing ? (
              <MetaItem label="Oldest wait">{elapsed(oldest).label}</MetaItem>
            ) : null}
            {late > 0 ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-danger">
                <TriangleAlertIcon aria-hidden="true" className="size-3.5" />
                {late} over {LATE_AFTER}h
              </span>
            ) : null}
            {noProof > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-muted">
                <ImageIcon aria-hidden="true" className="size-3.5" />
                {noProof} with no proof attached
              </span>
            ) : null}
          </>
        }
      />

      <div className="mt-5">
        <FilterBar label="Filter by status">
          {TABS.map((tab) => (
            <FilterLink
              key={tab.status}
              href={
                tab.status === "ADMIN_REVIEW"
                  ? "/admin/listings"
                  : `/admin/listings?status=${tab.status}`
              }
              active={tab.status === active}
              count={counts[tab.key]}
            >
              {tab.label}
            </FilterLink>
          ))}
        </FilterBar>
      </div>

      <ConsoleSection
        id="queue"
        title={LISTING_STATUS[active].label}
        count={queue.length}
        tone={reviewing && queue.length > 0 ? "primary" : "neutral"}
        description={
          queue.length === 100
            ? NEWEST_FIRST.includes(active)
              ? "Showing the 100 most recently changed."
              : "Showing the 100 oldest. Clear some and the rest will appear."
            : LISTING_STATUS[active].note
        }
      >
        {queue.length === 0 ? (
          reviewing ? (
            <AllClear
              title="The review queue is clear"
              body="Nothing is waiting on a moderator. A listing lands here the moment a seller sends it for review."
            />
          ) : (
            <Nothing
              title="Nothing in this view"
              body={`No listing is currently ${LISTING_STATUS[active].label.toLowerCase()}. Try another filter above.`}
            />
          )
        ) : (
          <ul className="grid gap-px overflow-hidden rounded-card border border-line bg-line">
            {queue.map((item) => {
              const urgent =
                reviewing && elapsed(item.waitingSince).hours >= LATE_AFTER;
              return (
                <li key={item.id} className="relative bg-surface">
                  {urgent ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 w-[3px] bg-danger"
                    />
                  ) : null}
                  <Link
                    href={`/admin/listings/${item.id}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2.5 p-4 pl-5 transition-colors hover:bg-surface-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-fg">
                        {item.title || item.handle}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-subtle">
                        {item.handle} · {item.sellerName}
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-2">
                        <ListingStatusTag status={item.status} />
                        <span className="text-[0.6875rem] text-subtle capitalize">
                          {item.platform}
                        </span>
                        {item.featured && item.status === "LIVE" ? (
                          <span className="inline-flex items-center gap-1 text-[0.6875rem] font-semibold text-primary-text">
                            <StarIcon
                              aria-hidden="true"
                              className="size-3 fill-current"
                            />
                            featured
                          </span>
                        ) : null}
                        {item.proofCount === 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-danger/30 bg-danger-soft px-1.5 py-0.5 text-[0.625rem] font-semibold text-danger">
                            <TriangleAlertIcon
                              aria-hidden="true"
                              className="size-3"
                            />
                            no proof
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[0.6875rem] text-subtle">
                            <ImageIcon aria-hidden="true" className="size-3" />
                            {item.proofCount} screenshot
                            {item.proofCount === 1 ? "" : "s"}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <Price
                        usd={item.price}
                        className="font-display text-base font-bold text-fg"
                      />
                      <span className="text-[0.625rem] tracking-wide text-subtle uppercase">
                        asking
                      </span>
                      <Waited
                        since={item.waitingSince}
                        prefix={reviewing ? "waiting" : "changed"}
                        warnAfter={
                          reviewing ? WARN_AFTER : Number.POSITIVE_INFINITY
                        }
                        lateAfter={
                          reviewing ? LATE_AFTER : Number.POSITIVE_INFINITY
                        }
                      />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </ConsoleSection>
    </>
  );
}
