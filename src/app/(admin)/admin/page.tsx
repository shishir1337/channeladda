import {
  ActivityIcon,
  ArrowRightIcon,
  BadgeCheckIcon,
  CoinsIcon,
  FlagIcon,
  LifeBuoyIcon,
  MessageSquareIcon,
  StoreIcon,
  TagIcon,
  TriangleAlertIcon,
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
import { getSettings } from "@/server/settings";
import { countOpenTickets } from "@/server/support";
import { listPendingWithdrawals } from "@/server/wallet";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

/**
 * How long the sweep may be silent before the overview shouts.
 *
 * The documented crontab runs it every ten minutes, so this is three missed
 * runs — not one late tick, but long enough that something is wrong.
 */
const SWEEP_STALE_MINUTES = 30;

/** What each job in the sweep does, in words, keyed as the cron writes them. */
const SWEEP_JOBS: Record<
  string,
  { label: string; did: (n: number) => string }
> = {
  reconciled: {
    label: "Applying payments whose callback was lost",
    did: (n) => `${n} lost ${n === 1 ? "payment" : "payments"} applied`,
  },
  deals: {
    label: "Expiring unpaid deals",
    did: (n) => `${n} unpaid ${n === 1 ? "deal" : "deals"} expired`,
  },
  offers: {
    label: "Lapsing old offers",
    did: (n) => `${n} ${n === 1 ? "offer" : "offers"} lapsed`,
  },
  media: {
    label: "Deleting expired chat files",
    did: (n) => `${n} chat ${n === 1 ? "file" : "files"} deleted`,
  },
  messages: {
    label: "Deleting old chat messages",
    did: (n) => `${n} old ${n === 1 ? "message" : "messages"} deleted`,
  },
  orphans: {
    label: "Collecting unused uploads",
    did: (n) => `${n} unused ${n === 1 ? "upload" : "uploads"} collected`,
  },
};

/**
 * The scheduled sweep's heartbeat.
 *
 * `POST /api/cron` writes `lastSweepAt` and what each job did on every run.
 * Before that a dead crontab was silent, and its documented consequence is
 * listings reserved for ever and paid invoices never applied — so a stale or
 * failing sweep is the loudest thing on this page, and a healthy one is a
 * single quiet line.
 */
function SweepHeartbeat({
  at,
  result,
}: {
  at: Date | null;
  result: Record<string, number | string> | null;
}) {
  const minutes =
    at === null ? null : Math.floor((Date.now() - at.getTime()) / 60_000);
  const stale = minutes === null || minutes > SWEEP_STALE_MINUTES;
  const jobs = Object.entries(result ?? {}).filter(([name]) => name !== "ms");
  const failed = jobs.filter(([, value]) => typeof value === "string");

  const when = at ? (
    <time
      dateTime={at.toISOString()}
      title={at.toLocaleString("en-GB")}
      className="tnum"
    >
      {elapsed(at).label === "just now"
        ? "just now"
        : `${elapsed(at).label} ago`}
    </time>
  ) : null;

  if (!stale && failed.length === 0) {
    return (
      <p className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-card border border-verified/25 bg-verified-soft px-3.5 py-2.5 text-xs text-muted">
        <ActivityIcon
          aria-hidden="true"
          className="size-3.5 shrink-0 text-verified"
        />
        <span className="font-semibold text-fg">Scheduled sweep</span>
        <span>ran {when}, every job fine.</span>
        <span className="text-subtle">
          {jobs
            .flatMap(([name, value]) =>
              typeof value === "number" && value > 0
                ? [SWEEP_JOBS[name]?.did(value) ?? `${name}: ${value}`]
                : [],
            )
            .join(" · ") || "Nothing needed doing."}
        </span>
      </p>
    );
  }

  return (
    <div
      role="alert"
      className="mt-5 rounded-card border border-danger/40 bg-danger-soft p-4 sm:p-5"
    >
      <p className="flex items-start gap-2 font-display text-base font-bold text-fg">
        <TriangleAlertIcon
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-danger"
        />
        <span>
          {at === null
            ? "The scheduled sweep has never run"
            : stale
              ? `The scheduled sweep has not run for ${elapsed(at).label}`
              : `The last sweep ran ${elapsed(at).label === "just now" ? "just now" : `${elapsed(at).label} ago`}, but ${failed.length === 1 ? "one job" : `${failed.length} jobs`} failed`}
        </span>
      </p>

      {stale ? (
        <>
          <p className="mt-2 max-w-[72ch] text-sm leading-relaxed text-fg">
            It should run every ten minutes. Until it does, unpaid deals never
            expire — so their listings stay reserved for ever — payments whose
            callback went missing are never applied, old offers stay open and
            expired chat files are not deleted.
          </p>
          <p className="mt-2 max-w-[72ch] text-xs leading-relaxed text-muted">
            The server&rsquo;s crontab calls <code>POST /api/cron</code> with
            the cron secret; the setup is in the deployment guide. Whoever looks
            after the server needs to know about this today.
            {at ? (
              <>
                {" "}
                Last run:{" "}
                <time dateTime={at.toISOString()} className="tnum">
                  {at.toLocaleString("en-GB")}
                </time>
                .
              </>
            ) : null}
          </p>
        </>
      ) : null}

      {failed.length > 0 ? (
        <ul className="mt-3 grid gap-1.5">
          {failed.map(([name, message]) => (
            <li key={name} className="text-xs leading-relaxed">
              <span className="font-semibold text-fg">
                {SWEEP_JOBS[name]?.label ?? name}
              </span>
              <span className="text-muted"> failed: </span>
              <span className="font-mono break-all text-danger">
                {String(message)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {failed.length > 0 ? (
        <p className="mt-2 max-w-[72ch] text-xs leading-relaxed text-muted">
          The other jobs still ran. A failing job is retried on the next run, so
          one failure can be a blip; the same one twice in a row needs somebody
          to look at the server logs.
        </p>
      ) : null}
    </div>
  );
}

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

  const [
    counts,
    review,
    trail,
    reports,
    flagged,
    openTickets,
    payouts,
    settings,
  ] = await Promise.all([
    getQueueCounts(),
    getReviewQueue("ADMIN_REVIEW"),
    getAuditTrail({}, 12),
    getOpenReports(),
    countFlaggedThreads(),
    countOpenTickets(),
    // FINANCE and SUPERADMIN only, matching the nav and the page's own
    // `requireRole("FINANCE")`. A moderator never sees a payout figure.
    isFinance ? listPendingWithdrawals() : Promise.resolve([]),
    getSettings(),
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

      <SweepHeartbeat
        at={settings.lastSweepAt}
        result={settings.lastSweepResult}
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
