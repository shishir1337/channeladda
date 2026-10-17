import {
  ArrowRightIcon,
  BadgeCheckIcon,
  CoinsIcon,
  FlagIcon,
  LifeBuoyIcon,
  MessageSquareIcon,
  StoreIcon,
  TagIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AllClear,
  Amount,
  ConsoleHeader,
  ConsoleSection,
  MetaItem,
  Metric,
  MetricGrid,
  RowItem,
  Rows,
  TableScroller,
  Td,
  Th,
} from "@/components/admin/console";
import { ReportQueue } from "@/components/admin/report-queue";
import {
  auditLabel,
  elapsed,
  ListingStatusTag,
  Waited,
} from "@/components/admin/vocab";
import { Button } from "@/components/ui/button";
import { getQueueCounts, getReviewQueue } from "@/server/admin-listings";
import { getAuditTrail } from "@/server/audit";
import { countFlaggedThreads } from "@/server/messages";
import { getOpenReports } from "@/server/reports";
import { requireStaff } from "@/server/session";
import { countOpenTickets } from "@/server/support";
import { listPendingWithdrawals } from "@/server/wallet";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

/** The oldest of a set of timestamps, or null when the set is empty. */
function oldestOf(dates: readonly Date[]): Date | null {
  return dates.reduce<Date | null>(
    (oldest, date) => (oldest === null || date < oldest ? date : oldest),
    null,
  );
}

/**
 * The staff overview, written as a shift handover.
 *
 * Not a wall of totals: the question somebody arriving at their desk is
 * actually asking is "what is waiting, how long has it waited, and what is
 * unusual". So the first band is only the queues that need a human, each with
 * the age of the oldest thing in it; the second band is the pipeline, which is
 * context rather than work; and the money desk only appears for the roles that
 * can open it — the same gate the nav and the payouts page itself use.
 */
export default async function AdminOverviewPage() {
  const staff = await requireStaff();
  const isFinance = staff.role === "FINANCE" || staff.role === "SUPERADMIN";

  const [counts, review, trail, reports, flagged, openTickets, payouts] =
    await Promise.all([
      getQueueCounts(),
      getReviewQueue("ADMIN_REVIEW"),
      getAuditTrail({}, 12),
      getOpenReports(),
      countFlaggedThreads(),
      countOpenTickets(),
      // FINANCE and SUPERADMIN only, matching the nav and the page's own
      // `requireRole("FINANCE")`. A moderator never sees a payout figure.
      isFinance ? listPendingWithdrawals() : Promise.resolve([]),
    ]);

  const waiting =
    counts.awaitingReview +
    reports.length +
    flagged +
    openTickets +
    payouts.length;

  const oldest = oldestOf([
    ...review.map((item) => item.waitingSince),
    ...reports.map((report) => report.createdAt),
    ...payouts.map((payout) => payout.requestedAt),
  ]);

  const payoutTotal = payouts.reduce(
    (sum, payout) => sum + payout.amountUsd,
    0,
  );

  return (
    <>
      <ConsoleHeader
        eyebrow="Staff"
        title={
          waiting === 0
            ? "Every desk is clear"
            : `${waiting.toLocaleString("en-US")} ${waiting === 1 ? "thing" : "things"} waiting on staff`
        }
        description={
          waiting === 0
            ? "Nothing is queued for a human. New work shows up here the moment it arrives."
            : oldest
              ? `Queues are worked oldest first. The oldest thing on this page has been waiting ${elapsed(oldest).label}.`
              : "Queues are worked oldest first, so start at the top of whichever one is loudest."
        }
        actions={
          counts.awaitingReview > 0 ? (
            <Button asChild size="sm">
              <Link href="/admin/listings">
                Start reviewing
                <ArrowRightIcon aria-hidden="true" className="size-4" />
              </Link>
            </Button>
          ) : null
        }
        meta={
          <>
            <MetaItem label="Signed in as">{staff.name}</MetaItem>
            <MetaItem label="Desk">
              {staff.role.toLowerCase().replace("_", " ")}
            </MetaItem>
            <MetaItem label="Read">
              {new Date().toLocaleString("en-GB")}
            </MetaItem>
          </>
        }
      />

      <ConsoleSection
        id="waiting"
        title="Waiting on a human"
        tone={waiting > 0 ? "primary" : "verified"}
        description="Each of these is somebody on the other side of the product waiting for an answer."
      >
        <MetricGrid>
          <Metric
            label="Listings for review"
            value={counts.awaitingReview}
            icon={BadgeCheckIcon}
            href="/admin/listings"
            tone={counts.awaitingReview > 0 ? "primary" : "neutral"}
            chip={
              review.at(0) ? (
                <Waited since={review[0].waitingSince} prefix="oldest" />
              ) : null
            }
            note="Sellers waiting on a decision."
          />
          <Metric
            label="Reported by users"
            value={reports.length}
            icon={FlagIcon}
            href="#reports"
            tone={reports.length > 0 ? "danger" : "neutral"}
            chip={
              reports.at(0) ? (
                <Waited since={reports[0].createdAt} prefix="oldest" />
              ) : null
            }
            note="Open reports against live listings."
          />
          <Metric
            label="Flagged threads"
            value={flagged}
            icon={MessageSquareIcon}
            href="/admin/messages?filter=flagged"
            tone={flagged > 0 ? "danger" : "neutral"}
            note="Someone tried to take a deal off-platform."
          />
          <Metric
            label="Open support"
            value={openTickets}
            icon={LifeBuoyIcon}
            href="/admin/support?status=OPEN"
            tone={openTickets > 0 ? "primary" : "neutral"}
            note="Including people who cannot sign in."
          />
          {isFinance ? (
            <Metric
              label="Payouts to send"
              value={payouts.length}
              icon={CoinsIcon}
              href="/admin/payouts"
              tone={payouts.length > 0 ? "primary" : "neutral"}
              chip={
                payouts.length > 0 ? (
                  <Amount
                    cents={payoutTotal}
                    caption="held against balances"
                    size="sm"
                    className="items-start"
                  />
                ) : null
              }
              note="Irreversible once sent."
            />
          ) : null}
        </MetricGrid>
      </ConsoleSection>

      <ConsoleSection
        id="pipeline"
        title="Pipeline"
        description="Not waiting on us. Here so a quiet queue can be told apart from an empty marketplace."
      >
        <MetricGrid>
          <Metric
            label="Placing their code"
            value={counts.awaitingCode}
            icon={TagIcon}
            href="/admin/listings?status=CODE_CHECK"
            note="With the seller, nothing to do."
          />
          <Metric
            label="Live"
            value={counts.live}
            icon={StoreIcon}
            href="/admin/listings?status=LIVE"
            note="Visible to buyers right now."
          />
          <Metric
            label="Sent back"
            value={counts.rejected}
            icon={ArrowRightIcon}
            href="/admin/listings?status=REJECTED"
            note="Waiting on the seller to fix something."
          />
        </MetricGrid>
      </ConsoleSection>

      <ConsoleSection
        id="reports"
        title="Reported by users"
        count={reports.length}
        tone={reports.length > 0 ? "danger" : "neutral"}
        description="Oldest first. A report is a person telling us something on the marketplace is wrong, so these are read before the review queue."
      >
        {reports.length === 0 ? (
          <AllClear
            title="Nothing reported"
            body="No open reports against any listing. Buyers and sellers can raise one from any listing page."
          />
        ) : (
          <ReportQueue
            reports={reports.map((report) => ({
              id: report.id,
              reason: report.reason,
              detail: report.detail,
              listingId: report.listingId,
              listingHandle: report.listingHandle,
              listingStatus: report.listingStatus,
              reporterName: report.reporterName,
              reportedAt: report.createdAt.toISOString(),
            }))}
          />
        )}
      </ConsoleSection>

      {review.length > 0 ? (
        <ConsoleSection
          id="next-up"
          title="Next up for review"
          count={review.length}
          tone="primary"
          description="The oldest five in the listing queue. Whoever takes the shift should start here."
          actions={
            <Link
              href="/admin/listings"
              className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary-text underline-offset-4 hover:underline"
            >
              Open the queue
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </Link>
          }
        >
          <Rows>
            {review.slice(0, 5).map((item) => (
              <RowItem key={item.id}>
                <Link
                  href={`/admin/listings/${item.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 transition-colors hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-fg">
                      {item.title || item.handle}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-subtle">
                      {item.handle} · {item.sellerName} ·{" "}
                      {item.proofCount === 0
                        ? "no proof attached"
                        : `${item.proofCount} screenshot${item.proofCount === 1 ? "" : "s"}`}
                    </span>
                  </span>
                  <ListingStatusTag status={item.status} />
                  <Waited since={item.waitingSince} className="shrink-0" />
                </Link>
              </RowItem>
            ))}
          </Rows>
        </ConsoleSection>
      ) : null}

      <ConsoleSection
        id="done"
        title="What has been done"
        description="The last twelve privileged actions, from the audit trail. This is the handover: what the previous shift decided, and who decided it."
      >
        {trail.length === 0 ? (
          <AllClear
            title="No staff actions recorded yet"
            body="Every approval, rejection, removal and settings change is written here as it happens, under the name of whoever did it."
          />
        ) : (
          <TableScroller>
            <table className="w-full min-w-[34rem] text-sm">
              <caption className="sr-only">
                Recent staff actions, newest first
              </caption>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Who</Th>
                  <Th>Did what</Th>
                  <Th>Target</Th>
                </tr>
              </thead>
              <tbody>
                {trail.map((row) => (
                  <tr key={row.id} className="border-t border-line">
                    <Td className="whitespace-nowrap">
                      <time
                        dateTime={row.createdAt.toISOString()}
                        title={row.createdAt.toLocaleString("en-GB")}
                        className="tnum text-xs text-subtle"
                      >
                        {elapsed(row.createdAt).label}
                      </time>
                    </Td>
                    <Td className="font-medium whitespace-nowrap text-fg">
                      {row.actorName ?? "Someone"}
                    </Td>
                    <Td className="text-muted">{auditLabel(row.action)}</Td>
                    <Td>
                      {row.targetHref ? (
                        <Link
                          href={row.targetHref}
                          className="font-mono text-xs text-primary-text underline-offset-4 hover:underline"
                        >
                          {row.entityId.slice(-8)}
                        </Link>
                      ) : (
                        <span className="font-mono text-xs text-subtle">
                          {row.entity === "listing"
                            ? "listing deleted"
                            : row.entityId.slice(-8)}
                        </span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroller>
        )}
      </ConsoleSection>
    </>
  );
}
