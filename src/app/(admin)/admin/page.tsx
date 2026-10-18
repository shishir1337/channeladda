import {
  ArrowRightIcon,
  BadgeCheckIcon,
  CoinsIcon,
  FlagIcon,
  HistoryIcon,
  LifeBuoyIcon,
  MessageSquareIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ReportQueue } from "@/components/admin/report-queue";
import {
  auditLabel,
  elapsed,
  ListingStatusTag,
  TitleWithInfo,
  Waited,
} from "@/components/admin/vocab";
import { InfoTip } from "@/components/app/info-tip";
import {
  AllClear,
  Amount,
  Callout,
  Card,
  Disclosure,
  Dot,
  EmptyState,
  List,
  ListItem,
  ListRow,
  PageHeader,
  Section,
  SeeAll,
  Sep,
  SplitBar,
  Stat,
  StatGrid,
  TableCard,
  Td,
  Th,
  Tr,
} from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import {
  getQueueCounts,
  getReviewQueue,
  type QueueCounts,
} from "@/server/admin-listings";
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
 *
 * Loud, but short: the alarm says what is wrong and who has to hear about it,
 * and what stops and how to fix it are one click away under it.
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
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] leading-5 text-muted">
        <Dot tone="verified" pulse />
        <span className="font-medium text-fg">Scheduled sweep</span>
        <span>ran {when}, every job fine.</span>
        <InfoTip label="What the last sweep did">
          {jobs
            .flatMap(([name, value]) =>
              typeof value === "number" && value > 0
                ? [SWEEP_JOBS[name]?.did(value) ?? `${name}: ${value}`]
                : [],
            )
            .join(" · ") || "Nothing needed doing."}
        </InfoTip>
      </p>
    );
  }

  return (
    <div role="alert">
      <Callout
        tone="danger"
        title={
          at === null
            ? "The scheduled sweep has never run"
            : stale
              ? `The scheduled sweep has not run for ${elapsed(at).label}`
              : `The last sweep ran ${elapsed(at).label === "just now" ? "just now" : `${elapsed(at).label} ago`}, but ${failed.length === 1 ? "one job" : `${failed.length} jobs`} failed`
        }
      >
        {stale ? (
          <p className="max-w-[72ch] text-fg">
            It should run every ten minutes. Until it does, unpaid deals never
            expire — so their listings stay reserved for ever — payments whose
            callback went missing are never applied, old offers stay open and
            expired chat files are not deleted. Whoever looks after the server
            needs to know about this today.
          </p>
        ) : null}

        {failed.length > 0 ? (
          <ul className="mt-2 grid gap-1.5">
            {failed.map(([name, message]) => (
              <li key={name} className="text-xs leading-relaxed">
                <span className="font-medium text-fg">
                  {SWEEP_JOBS[name]?.label ?? name}
                </span>
                <span> failed: </span>
                <span className="font-mono break-all text-danger">
                  {String(message)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <Disclosure
          bare
          title={stale ? "How to fix it" : "What this means"}
          className="mt-1"
        >
          {stale ? (
            <p className="max-w-[72ch] text-xs">
              The server&rsquo;s crontab calls{" "}
              <code className="rounded bg-surface px-1 py-0.5 font-mono text-[0.6875rem] text-fg ring-1 ring-line">
                POST /api/cron
              </code>{" "}
              with the cron secret; the setup is in the deployment guide.
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
          ) : null}
          {failed.length > 0 ? (
            <p className={stale ? "mt-2 max-w-[72ch] text-xs" : "max-w-[72ch]"}>
              The other jobs still ran. A failing job is retried on the next
              run, so one failure can be a blip; the same one twice in a row
              needs somebody to look at the server logs.
            </p>
          ) : null}
        </Disclosure>
      </Callout>
    </div>
  );
}

/**
 * The listing stages that are not waiting on staff, in the order a listing
 * moves through them. Colours follow the status badges: live is green, sent
 * back is red, placing a code is the seller's quiet grey.
 */
const PIPELINE: readonly {
  status: "CODE_CHECK" | "LIVE" | "REJECTED";
  count: keyof QueueCounts;
  label: string;
  note: string;
  tone: "muted" | "verified" | "danger";
}[] = [
  {
    status: "CODE_CHECK",
    count: "awaitingCode",
    label: "Placing their code",
    note: "With the seller, nothing to do.",
    tone: "muted",
  },
  {
    status: "LIVE",
    count: "live",
    label: "Live",
    note: "Visible to buyers right now.",
    tone: "verified",
  },
  {
    status: "REJECTED",
    count: "rejected",
    label: "Sent back",
    note: "Waiting on the seller to fix something.",
    tone: "danger",
  },
];

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
 * the age of the oldest thing in it, followed by the work itself — reports,
 * then the head of the review queue. The pipeline is context rather than work,
 * so it comes after the work, just before the handover trail. The money desk
 * only appears for the roles that can open it — the same gate the nav and the
 * payouts page itself use.
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
      <PageHeader
        title={
          waiting === 0
            ? "Every desk is clear"
            : `${waiting.toLocaleString("en-US")} ${waiting === 1 ? "thing" : "things"} waiting on staff`
        }
        description={
          waiting > 0 && oldest
            ? `The oldest thing here has waited ${elapsed(oldest).label}.`
            : undefined
        }
        info={
          waiting === 0
            ? "Nothing is queued for a human. New work shows up here the moment it arrives."
            : oldest
              ? "Queues are worked oldest first."
              : "Queues are worked oldest first, so start at the top of whichever one is loudest."
        }
        actions={
          counts.awaitingReview > 0 ? (
            <Button asChild size="md">
              <Link href="/admin/listings">
                Start reviewing
                <ArrowRightIcon aria-hidden="true" />
              </Link>
            </Button>
          ) : null
        }
      />

      <SweepHeartbeat
        at={settings.lastSweepAt}
        result={settings.lastSweepResult}
      />

      <Section
        id="waiting"
        title="Waiting on a human"
        info="Each of these is somebody on the other side of the product waiting for an answer."
      >
        <StatGrid
          columns={isFinance ? 3 : 4}
          className={isFinance ? "xl:grid-cols-5" : undefined}
        >
          <Stat
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
            info="Sellers waiting on a decision."
          />
          <Stat
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
            info="Open reports against live listings."
          />
          <Stat
            label="Flagged threads"
            value={flagged}
            icon={MessageSquareIcon}
            href="/admin/messages?filter=flagged"
            tone={flagged > 0 ? "danger" : "neutral"}
            info="Someone tried to take a deal off-platform."
          />
          <Stat
            label="Open support"
            value={openTickets}
            icon={LifeBuoyIcon}
            href="/admin/support?status=OPEN"
            tone={openTickets > 0 ? "primary" : "neutral"}
            info="Including people who cannot sign in."
          />
          {isFinance ? (
            <Stat
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
        </StatGrid>
      </Section>

      <Section
        id="reports"
        title="Reported by users"
        count={reports.length}
        tone={reports.length > 0 ? "danger" : "neutral"}
        info="Oldest first. A report is a person telling us something on the marketplace is wrong, so these are read before the review queue."
      >
        {reports.length === 0 ? (
          <AllClear
            title="Nothing reported"
            body="Buyers and sellers can raise a report from any listing page."
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
      </Section>

      {review.length > 0 ? (
        <Section
          id="next-up"
          title="Next up for review"
          count={review.length}
          tone="primary"
          info="The oldest five in the listing queue. Whoever takes the shift starts here."
          actions={<SeeAll href="/admin/listings">Open the queue</SeeAll>}
        >
          <List>
            {review.slice(0, 5).map((item) => (
              <ListItem key={item.id} href={`/admin/listings/${item.id}`}>
                <ListRow
                  title={item.title || item.handle}
                  meta={
                    <>
                      <span className="min-w-0 truncate">{item.handle}</span>
                      <Sep />
                      <span className="min-w-0 truncate">
                        {item.sellerName}
                      </span>
                      <Sep />
                      <span>
                        {item.proofCount === 0
                          ? "no proof attached"
                          : `${item.proofCount} screenshot${item.proofCount === 1 ? "" : "s"}`}
                      </span>
                    </>
                  }
                  trailing={
                    <>
                      {/* Every row here is in the review queue, so on a
                          phone the status gives its room to the title. */}
                      <span className="hidden sm:inline-flex">
                        <ListingStatusTag status={item.status} />
                      </span>
                      <Waited since={item.waitingSince} />
                    </>
                  }
                  chevron
                />
              </ListItem>
            ))}
          </List>
        </Section>
      ) : null}

      {/* One bar rather than three cards: the pipeline is context, and the
          proportion — how much of the marketplace is live — is the point.
          Each stage still links to its filtered queue. */}
      <Section
        id="pipeline"
        title="Pipeline"
        info={
          <>
            <p>
              Not waiting on us. Here so a quiet queue can be told apart from an
              empty marketplace.
            </p>
            <ul className="mt-2 grid gap-1">
              {PIPELINE.map((stage) => (
                <li key={stage.status}>
                  <span className="font-medium text-fg">{stage.label}</span> —{" "}
                  {stage.note}
                </li>
              ))}
            </ul>
          </>
        }
      >
        <Card padded>
          <SplitBar
            label="Listings outside the review queue, by stage"
            parts={PIPELINE.map((stage) => ({
              label: (
                <Link
                  href={`/admin/listings?status=${stage.status}`}
                  className="inline-flex min-h-11 items-center rounded-sm underline-offset-4 transition-colors duration-150 hover:text-fg hover:underline pointer-fine:min-h-6"
                >
                  {stage.label}
                </Link>
              ),
              value: counts[stage.count],
              tone: stage.tone,
            }))}
          />
        </Card>
      </Section>

      <Section
        id="done"
        title="What has been done"
        info="The last twelve privileged actions from the audit trail: what the previous shift decided, and who decided it."
      >
        {trail.length === 0 ? (
          <EmptyState
            icon={HistoryIcon}
            title={
              <TitleWithInfo
                title="No staff actions recorded yet"
                label="About the audit trail"
              >
                Every approval, rejection, removal and settings change is
                written here as it happens, under the name of whoever did it.
              </TitleWithInfo>
            }
          />
        ) : (
          <TableCard>
            <table className="w-full min-w-[34rem] text-sm">
              <caption className="sr-only">
                Recent staff actions, newest first
              </caption>
              <thead>
                <tr>
                  <Th className="w-20">When</Th>
                  <Th>Who</Th>
                  <Th>Did what</Th>
                  <Th>Target</Th>
                </tr>
              </thead>
              <tbody>
                {trail.map((row) => (
                  <Tr key={row.id}>
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
                          className="rounded font-mono text-xs text-muted underline-offset-4 transition-colors hover:text-fg hover:underline"
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
                  </Tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        )}
      </Section>
    </>
  );
}
