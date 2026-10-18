"use client";

import { FlagIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SteadyLabel } from "@/components/admin/deal-controls";
import { LISTING_STATUS, Waited } from "@/components/admin/vocab";
import { Callout, List, ListItem, Sep } from "@/components/app/kit";
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
        <div role="alert" className="mb-3">
          <Callout tone="danger" title={error} />
        </div>
      ) : null}
      <List>
        {reports.map((report) => {
          const status = LISTING_STATUS[report.listingStatus as ListingStatus];
          return (
            <ListItem key={report.id} flag="danger">
              <div className="flex flex-wrap items-start gap-x-4 gap-y-3 sm:flex-nowrap">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <FlagIcon
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-danger"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-sm leading-5 font-medium text-fg">
                        {report.reason}
                      </p>
                      <Waited
                        since={new Date(report.reportedAt)}
                        prefix="open"
                      />
                    </div>
                    {report.detail ? (
                      <p className="mt-1 max-w-[72ch] text-[0.8125rem] leading-relaxed break-words text-muted">
                        {report.detail}
                      </p>
                    ) : null}
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-subtle">
                      <Link
                        href={`/admin/listings/${report.listingId}`}
                        className="font-medium text-fg underline-offset-4 hover:underline"
                      >
                        {report.listingHandle}
                      </Link>
                      <Sep />
                      <span>
                        {"listing is "}
                        {status?.label.toLowerCase() ??
                          report.listingStatus.toLowerCase().replace("_", " ")}
                      </span>
                      <Sep />
                      <span>
                        {"reported by "}
                        {report.reporterName}
                      </span>
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="ml-7 shrink-0 sm:ml-0"
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
                  <SteadyLabel
                    pending={pending && working === report.id}
                    idle="Mark handled"
                    busy="Closing…"
                  />
                </Button>
              </div>
            </ListItem>
          );
        })}
      </List>
    </>
  );
}
