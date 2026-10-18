import {
  ChevronRightIcon,
  ImageIcon,
  StarIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { Metadata } from "next";
import {
  elapsed,
  LISTING_STATUS,
  ListingStatusTag,
  Waited,
} from "@/components/admin/vocab";
import {
  AllClear,
  EmptyState,
  FilterBar,
  FilterLink,
  IconTile,
  List,
  ListItem,
  MetaItem,
  PageHeader,
  Section,
  Sep,
} from "@/components/app/kit";
import { Badge } from "@/components/ui/badge";
import { Price } from "@/components/ui/price";
import { platforms } from "@/data/platforms";
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
      <PageHeader
        title="Listing queue"
        description="Worked oldest first, so nobody sits at the bottom for ever."
        meta={
          <>
            <MetaItem label="Signed in as">{staff.name}</MetaItem>
            {oldest && reviewing ? (
              <MetaItem label="Oldest wait">{elapsed(oldest).label}</MetaItem>
            ) : null}
            {late > 0 ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-danger">
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
            tone={tab.status === "ADMIN_REVIEW" ? "primary" : "neutral"}
          >
            {tab.label}
          </FilterLink>
        ))}
      </FilterBar>

      <Section
        id="queue"
        className="mt-6"
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
            <EmptyState
              title="Nothing in this view"
              body={`No listing is currently ${LISTING_STATUS[active].label.toLowerCase()}. Try another filter above.`}
            />
          )
        ) : (
          <List>
            {queue.map((item) => {
              const urgent =
                reviewing && elapsed(item.waitingSince).hours >= LATE_AFTER;
              const platform = platforms.find((p) => p.id === item.platform);
              return (
                <ListItem
                  key={item.id}
                  href={`/admin/listings/${item.id}`}
                  flag={urgent ? "danger" : undefined}
                >
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
                    <div className="flex min-w-0 flex-1 basis-64 items-center gap-3">
                      <IconTile icon={platform?.icon ?? ImageIcon} />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm leading-5 font-medium text-fg">
                            {item.title || item.handle}
                          </span>
                          {item.featured && item.status === "LIVE" ? (
                            <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted">
                              <StarIcon
                                aria-hidden="true"
                                className="size-3 fill-current text-primary-text"
                              />
                              Featured
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[0.8125rem] leading-5 text-muted">
                          <span className="truncate">{item.handle}</span>
                          <Sep />
                          <span className="truncate">{item.sellerName}</span>
                          <Sep />
                          <span className="capitalize">
                            {platform?.name ?? item.platform}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="ml-11 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 sm:ml-0">
                      {item.proofCount === 0 ? (
                        <Badge variant="danger" size="sm">
                          <TriangleAlertIcon aria-hidden="true" />
                          No proof
                        </Badge>
                      ) : (
                        <span className="tnum inline-flex items-center gap-1 text-xs whitespace-nowrap text-subtle">
                          <ImageIcon aria-hidden="true" className="size-3.5" />
                          {item.proofCount} screenshot
                          {item.proofCount === 1 ? "" : "s"}
                        </span>
                      )}
                      <ListingStatusTag status={item.status} />
                      <span className="flex flex-col items-end gap-0.5 sm:w-32">
                        <span className="flex items-baseline gap-1.5">
                          <span className="text-xs text-subtle">Asking</span>
                          <Price
                            usd={item.price}
                            className="text-sm font-medium text-fg"
                          />
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
                      <ChevronRightIcon
                        aria-hidden="true"
                        className="hidden size-4 shrink-0 text-subtle transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-muted sm:block"
                      />
                    </div>
                  </div>
                </ListItem>
              );
            })}
          </List>
        )}
      </Section>
    </>
  );
}
