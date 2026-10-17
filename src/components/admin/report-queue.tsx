"use client";

import { FlagIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RowItem, Rows } from "@/components/admin/console";
import { LISTING_STATUS, Waited } from "@/components/admin/vocab";
import { Button } from "@/components/ui/button";
import type { ListingStatus } from "@/generated/prisma/enums";
import { resolveReport } from "@/server/actions/reports";

export type ReportRow = {
  id: string;
  reason: string;
  detail: string | null;
  listingId: string;
  listingHandle: string;
  listingStatus: string;
  reporterName: string;
  reportedAt: string;
};

/** Oldest first, same as the listing queue — nobody sits at the bottom. */
export function ReportQueue({ reports }: { reports: ReportRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      {error ? (
        <p
          role="alert"
          className="mb-3 rounded-card border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-fg"
        >
          {error}
        </p>
      ) : null}
      <Rows>
        {reports.map((report) => {
          const status = LISTING_STATUS[report.listingStatus as ListingStatus];
          return (
            <RowItem key={report.id} flag="danger">
              <div className="flex flex-wrap items-start gap-x-4 gap-y-3 p-4 pl-5">
                <FlagIcon
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-danger"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p className="text-sm font-semibold text-fg">
                      {report.reason}
                    </p>
                    <Waited since={new Date(report.reportedAt)} prefix="open" />
                  </div>
                  {report.detail ? (
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">
                      {report.detail}
                    </p>
                  ) : null}
                  <p className="mt-1.5 text-xs text-subtle">
                    <Link
                      href={`/admin/listings/${report.listingId}`}
                      className="font-medium text-primary-text underline-offset-4 hover:underline"
                    >
                      {report.listingHandle}
                    </Link>
                    {" · listing is "}
                    {status?.label.toLowerCase() ??
                      report.listingStatus.toLowerCase().replace("_", " ")}
                    {" · reported by "}
                    {report.reporterName}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                  disabled={pending}
                  onClick={() => {
                    setError(null);
                    setWorking(report.id);
                    startTransition(async () => {
                      const result = await resolveReport(report.id);
                      if (!result.ok) {
                        setError(result.error);
                        setWorking(null);
                        return;
                      }
                      router.refresh();
                    });
                  }}
                >
                  {pending && working === report.id
                    ? "Closing…"
                    : "Mark handled"}
                </Button>
              </div>
            </RowItem>
          );
        })}
      </Rows>
    </>
  );
}
