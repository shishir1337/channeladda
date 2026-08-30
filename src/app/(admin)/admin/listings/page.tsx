import type { Metadata } from "next";
import Link from "next/link";
import { ListingStatusBadge } from "@/components/dashboard/listing-status";
import {
  Empty,
  PageHead,
  Row,
  Rows,
  Section,
} from "@/components/dashboard/page-parts";
import type { ListingStatus } from "@/generated/prisma/enums";
import { getReviewQueue } from "@/server/admin-listings";
import { requireStaff } from "@/server/session";

export const metadata: Metadata = {
  title: "Listing queue",
  robots: { index: false, follow: false },
};

const TABS: { label: string; status: ListingStatus }[] = [
  { label: "For review", status: "ADMIN_REVIEW" },
  { label: "Placing code", status: "CODE_CHECK" },
  { label: "Live", status: "LIVE" },
  { label: "Sent back", status: "REJECTED" },
];

function waited(since: Date) {
  const hours = (Date.now() - since.getTime()) / 3_600_000;
  if (hours < 1) return { text: "just now", late: false };
  if (hours < 24) return { text: `${Math.round(hours)}h`, late: hours > 12 };
  const days = Math.round(hours / 24);
  return { text: `${days}d`, late: true };
}

export default async function AdminListingsPage({
  searchParams,
}: PageProps<"/admin/listings">) {
  await requireStaff();
  const params = await searchParams;

  const requested = typeof params.status === "string" ? params.status : "";
  const active =
    TABS.find((t) => t.status === requested)?.status ?? "ADMIN_REVIEW";

  const queue = await getReviewQueue(active);

  return (
    <>
      <PageHead
        title="Listings"
        description={
          queue.length === 0
            ? "Nothing in this queue."
            : queue.length === 100
              ? "Showing the 100 oldest."
              : `${queue.length} listing${queue.length === 1 ? "" : "s"}, oldest first — so nobody sits at the bottom forever.`
        }
      />

      <nav
        aria-label="Filter by status"
        className="mt-6 flex flex-wrap gap-2 border-b border-line pb-4"
      >
        {TABS.map((tab) => (
          <Link
            key={tab.status}
            href={
              tab.status === "ADMIN_REVIEW"
                ? "/admin/listings"
                : `/admin/listings?status=${tab.status}`
            }
            aria-current={tab.status === active ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-medium transition-colors ${
              tab.status === active
                ? "border-primary bg-primary-soft text-primary-text"
                : "border-line bg-surface text-muted hover:border-line-strong hover:text-fg"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {queue.length === 0 ? (
        <Section>
          <Empty
            title="Nothing here"
            body="When a seller sends a listing for review it lands in this queue, oldest first."
          />
        </Section>
      ) : (
        <Section>
          <Rows>
            {queue.map((item) => {
              const wait = waited(item.waitingSince);
              return (
                <Row key={item.id}>
                  <Link
                    href={`/admin/listings/${item.id}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 transition-colors hover:bg-surface-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <ListingStatusBadge status={item.status} size="sm" />
                        <span className="text-xs text-subtle capitalize">
                          {item.platform}
                        </span>
                        {item.proofCount === 0 ? (
                          <span className="text-xs font-medium text-danger">
                            no proof attached
                          </span>
                        ) : (
                          <span className="text-xs text-subtle">
                            {item.proofCount} screenshot
                            {item.proofCount === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 truncate font-medium text-fg">
                        {item.title || item.handle}
                      </p>
                      <p className="truncate text-sm text-subtle">
                        {item.handle} · {item.sellerName}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-display font-bold text-fg tabular-nums">
                        {item.price.toLocaleString("en-US", {
                          style: "currency",
                          currency: "USD",
                          maximumFractionDigits: 0,
                        })}
                      </p>
                      <p
                        className={`text-xs tabular-nums ${
                          wait.late ? "text-danger" : "text-subtle"
                        }`}
                      >
                        waiting {wait.text}
                      </p>
                    </div>
                  </Link>
                </Row>
              );
            })}
          </Rows>
        </Section>
      )}
    </>
  );
}
