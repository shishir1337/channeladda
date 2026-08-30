import { ArrowRightIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ReportQueue } from "@/components/admin/report-queue";
import { getQueueCounts } from "@/server/admin-listings";
import { getAuditTrail } from "@/server/audit";
import { getOpenReports } from "@/server/reports";
import { requireStaff } from "@/server/session";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

function ago(date: Date) {
  const mins = Math.round((Date.now() - date.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const ACTION_LABEL: Record<string, string> = {
  "listing.approve": "approved a listing",
  "listing.reject": "sent a listing back",
  "listing.remove": "took a listing down",
  "settings.update": "changed the platform settings",
};

export default async function AdminOverviewPage() {
  const staff = await requireStaff();
  const [counts, trail, reports] = await Promise.all([
    getQueueCounts(),
    getAuditTrail({}, 12),
    getOpenReports(),
  ]);

  const queues = [
    {
      label: "Waiting for review",
      value: counts.awaitingReview,
      href: "/admin/listings",
      urgent: counts.awaitingReview > 0,
      note: "Sellers are waiting on a decision.",
    },
    {
      label: "Placing their code",
      value: counts.awaitingCode,
      href: "/admin/listings?status=CODE_CHECK",
      urgent: false,
      note: "With the seller, nothing to do.",
    },
    {
      label: "Live",
      value: counts.live,
      href: "/admin/listings?status=LIVE",
      urgent: false,
      note: "Visible to buyers right now.",
    },
    {
      label: "Sent back",
      value: counts.rejected,
      href: "/admin/listings?status=REJECTED",
      urgent: false,
      note: "Waiting on the seller to fix something.",
    },
  ];

  return (
    <>
      <p className="text-xs font-semibold tracking-[0.14em] text-subtle uppercase">
        Staff
      </p>
      <h1 className="mt-2 font-display text-3xl font-black tracking-tight text-fg">
        {counts.awaitingReview === 0
          ? "The queue is clear"
          : `${counts.awaitingReview} waiting for you`}
      </h1>
      <p className="mt-2 text-muted">
        Signed in as {staff.name} · {staff.role.toLowerCase()}
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {queues.map((queue) => (
          <Link
            key={queue.label}
            href={queue.href}
            className={`rounded-panel border p-5 transition-colors ${
              queue.urgent
                ? "border-primary/40 bg-primary-soft hover:border-primary"
                : "border-line bg-surface hover:border-line-strong"
            }`}
          >
            <p className="text-xs font-semibold tracking-[0.12em] text-subtle uppercase">
              {queue.label}
            </p>
            <p
              className={`mt-2 font-display text-3xl font-black tabular-nums ${
                queue.urgent ? "text-primary-text" : "text-fg"
              }`}
            >
              {queue.value.toLocaleString("en-US")}
            </p>
            <p className="mt-1 text-xs text-subtle">{queue.note}</p>
          </Link>
        ))}
      </div>

      {reports.length > 0 ? (
        <div className="mt-10">
          <h2 className="font-display text-xl font-bold text-fg">
            Reported by users
          </h2>
          <p className="mt-1 mb-3 text-sm text-muted">
            {reports.length} open, oldest first.
          </p>
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
        </div>
      ) : null}

      <div className="mt-10">
        <div className="flex items-end justify-between gap-4">
          <h2 className="font-display text-xl font-bold text-fg">
            What has been done
          </h2>
          {counts.awaitingReview > 0 ? (
            <Link
              href="/admin/listings"
              className="inline-flex min-h-11 items-center gap-1.5 text-sm text-primary-text underline-offset-4 hover:underline"
            >
              Start reviewing
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </Link>
          ) : null}
        </div>

        {trail.length === 0 ? (
          <p className="mt-4 rounded-panel border border-dashed border-line bg-surface p-8 text-center text-sm text-subtle">
            No staff actions recorded yet.
          </p>
        ) : (
          <ul className="mt-4 grid gap-px overflow-hidden rounded-panel border border-line bg-line">
            {trail.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 bg-surface px-4 py-3 text-sm"
              >
                <span className="font-medium text-fg">
                  {row.actorName ?? "Someone"}
                </span>
                <span className="text-muted">
                  {ACTION_LABEL[row.action] ?? row.action}
                </span>
                {row.targetHref ? (
                  <Link
                    href={row.targetHref}
                    className="truncate font-mono text-xs text-primary-text underline-offset-4 hover:underline"
                  >
                    {row.entityId.slice(-8)}
                  </Link>
                ) : (
                  <span className="truncate font-mono text-xs text-subtle">
                    {row.entity === "listing"
                      ? "listing deleted"
                      : row.entityId.slice(-8)}
                  </span>
                )}
                <span className="ml-auto shrink-0 text-xs text-subtle tabular-nums">
                  {ago(row.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
