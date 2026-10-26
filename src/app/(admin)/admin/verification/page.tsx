import { FingerprintIcon, TriangleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import { elapsed, Waited } from "@/components/admin/vocab";
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
import { documentLabel, KYC_REVIEW_HOURS } from "@/lib/kyc";
import { shortDate } from "@/lib/time";
import {
  countKycByStatus,
  type KycQueueStatus,
  listKycQueue,
} from "@/server/kyc";
import { requireRole } from "@/server/session";
import { viewerZone } from "@/server/viewer-zone";

export const metadata: Metadata = {
  title: "ID checks",
  robots: { index: false, follow: false },
};

const TABS: { label: string; status: KycQueueStatus }[] = [
  { label: "Waiting", status: "PENDING" },
  { label: "Approved", status: "APPROVED" },
  { label: "Not approved", status: "REJECTED" },
];

/** Members are told a check takes up to this long. */
const WARN_AFTER = 12;
const LATE_AFTER = KYC_REVIEW_HOURS;

/**
 * Members waiting for the Verified badge, oldest first.
 *
 * MODERATOR and SUPERADMIN only: the same people who may open the files.
 * Finance and agents get the 404 a stranger would, and the nav does not
 * draw the link for them.
 */
export default async function VerificationQueuePage({
  searchParams,
}: PageProps<"/admin/verification">) {
  await requireRole("MODERATOR");
  const params = await searchParams;
  const zone = await viewerZone();

  const requested = typeof params.status === "string" ? params.status : "";
  const active = TABS.find((t) => t.status === requested)?.status ?? "PENDING";

  const [queue, counts] = await Promise.all([
    listKycQueue(active),
    countKycByStatus(),
  ]);

  const waiting = active === "PENDING";
  const oldest = waiting ? queue.at(0)?.submittedAt : undefined;
  const late = waiting
    ? queue.filter((item) => elapsed(item.submittedAt).hours >= LATE_AFTER)
        .length
    : 0;

  return (
    <>
      <PageHeader
        title="ID checks"
        info="Members send an ID and a selfie video for the Verified badge. It is optional, and nothing but the badge depends on it. Worked oldest first."
        meta={
          <>
            {oldest ? (
              <MetaItem label="Oldest wait">{elapsed(oldest).label}</MetaItem>
            ) : null}
            {late > 0 ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-primary-text">
                <TriangleAlertIcon aria-hidden="true" className="size-3.5" />
                {late} over {LATE_AFTER}h
              </span>
            ) : null}
          </>
        }
      />

      <FilterBar label="Filter ID checks">
        {TABS.map((tab) => (
          <FilterLink
            key={tab.status}
            href={
              tab.status === "PENDING"
                ? "/admin/verification"
                : `/admin/verification?status=${tab.status}`
            }
            active={tab.status === active}
            count={counts[tab.status]}
            tone={tab.status === "PENDING" ? "primary" : "neutral"}
          >
            {tab.label}
          </FilterLink>
        ))}
      </FilterBar>

      <Section
        id="queue"
        className="mt-6"
        title={TABS.find((t) => t.status === active)?.label}
        count={queue.length}
        tone={waiting && queue.length > 0 ? "primary" : "neutral"}
        description={
          queue.length === 100
            ? waiting
              ? "Showing the 100 oldest. Clear some and the rest will appear."
              : "Showing the 100 most recent."
            : undefined
        }
      >
        {queue.length === 0 ? (
          waiting ? (
            <AllClear
              title="No ID checks waiting"
              body="One lands here the moment a member sends their ID."
            />
          ) : (
            <EmptyState
              icon={FingerprintIcon}
              title="Nothing here yet"
              body="Decided checks show here, newest first."
            />
          )
        ) : (
          <List>
            {queue.map((item) => (
              <ListItem
                key={item.id}
                href={`/admin/verification/${item.id}`}
                flag={item.duplicate ? "primary" : undefined}
              >
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
                  <div className="flex min-w-0 flex-1 basis-64 items-center gap-3">
                    <IconTile icon={FingerprintIcon} />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="truncate text-sm leading-5 font-medium text-fg">
                          {item.fullName}
                        </span>
                        {item.duplicate ? (
                          <Badge variant="warning">
                            Same ID on another account
                          </Badge>
                        ) : null}
                        {item.banned ? (
                          <Badge variant="warning">Suspended</Badge>
                        ) : null}
                      </div>
                      <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[0.8125rem] leading-5 text-muted">
                        <span>{documentLabel(item.documentType)}</span>
                        <Sep />
                        <span className="truncate">{item.country}</span>
                        <Sep />
                        <span className="truncate">
                          Account: {item.accountName}
                        </span>
                        {item.attempts > 1 ? (
                          <>
                            <Sep />
                            <span>Try {item.attempts}</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 pl-11 sm:pl-0">
                    {waiting ? (
                      <Waited
                        since={item.submittedAt}
                        warnAfter={WARN_AFTER}
                        lateAfter={LATE_AFTER}
                      />
                    ) : item.reviewedAt ? (
                      <span className="text-xs text-subtle">
                        {shortDate(item.reviewedAt, zone)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </ListItem>
            ))}
          </List>
        )}
      </Section>
    </>
  );
}
