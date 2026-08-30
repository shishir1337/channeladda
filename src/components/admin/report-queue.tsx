"use client";

import { FlagIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Row, Rows } from "@/components/dashboard/page-parts";
import { Button } from "@/components/ui/button";
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
  const [pending, startTransition] = useTransition();

  return (
    <>
      {error ? (
        <p role="alert" className="mb-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Rows>
        {reports.map((report) => (
          <Row key={report.id}>
            <div className="flex flex-wrap items-start gap-4 p-4">
              <FlagIcon
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-danger"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg">{report.reason}</p>
                {report.detail ? (
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    {report.detail}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-subtle">
                  <Link
                    href={`/admin/listings/${report.listingId}`}
                    className="text-primary-text underline-offset-4 hover:underline"
                  >
                    {report.listingHandle}
                  </Link>
                  {" · "}
                  {report.listingStatus.toLowerCase().replace("_", " ")}
                  {" · reported by "}
                  {report.reporterName}
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    const result = await resolveReport(report.id);
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    router.refresh();
                  });
                }}
              >
                Handled
              </Button>
            </div>
          </Row>
        ))}
      </Rows>
    </>
  );
}
