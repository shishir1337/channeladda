import type { Metadata } from "next";
import {
  AllClear,
  Dot,
  FilterBar,
  FilterLink,
  MetaItem,
  PageHeader,
  Section,
} from "@/components/app/kit";
import { ThreadList, type ThreadRow } from "@/components/messages/thread-list";
import { listStaffThreads } from "@/server/messages";
import { requireStaff } from "@/server/session";

export const metadata: Metadata = {
  title: "Conversations",
  robots: { index: false, follow: false },
};

/**
 * Every conversation on the platform.
 *
 * Flagged threads sort to the top. A flag means someone tried to move the deal
 * off Channel Adda, which is the single strongest predictor that one of the
 * two is about to be defrauded — so the flagged count is on the filter itself
 * rather than something you find by clicking.
 */
export default async function AdminMessagesPage({
  searchParams,
}: PageProps<"/admin/messages">) {
  const staff = await requireStaff();
  const { filter } = await searchParams;
  const flaggedOnly = filter === "flagged";

  const threads = await listStaffThreads({ flaggedOnly });

  // Counted from the list already fetched rather than with another query:
  // when the filter is on, every row in it is flagged by definition.
  const flaggedCount = flaggedOnly
    ? threads.length
    : threads.filter((thread) => thread.flagged).length;

  const rows: ThreadRow[] = threads.map((thread) => ({
    id: thread.id,
    listingTitle: thread.listingTitle,
    listingHandle: thread.listingHandle,
    withName: thread.withName,
    lastMessageAt: thread.lastMessageAt.toISOString(),
    preview: thread.preview,
    unread: 0,
    flagged: thread.flagged,
    closed: thread.closed,
    flagReason: thread.flagReason,
  }));

  return (
    <>
      <PageHeader
        title="Conversations"
        description="Every buyer–seller thread. Read any of them, and write into any as Channel Adda."
        meta={
          <>
            <MetaItem label="Signed in as">{staff.name}</MetaItem>
            <MetaItem label="Showing">
              <span className="tabular-nums">
                {rows.length.toLocaleString("en-US")}
              </span>{" "}
              {rows.length === 1 ? "thread" : "threads"}
            </MetaItem>
            {flaggedCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-danger tabular-nums">
                <Dot tone="danger" />
                {flaggedCount} flagged
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-muted">
                <Dot tone="verified" />
                Nothing flagged
              </span>
            )}
          </>
        }
      />

      <FilterBar label="Filter conversations">
        <FilterLink href="/admin/messages" active={!flaggedOnly}>
          All
        </FilterLink>
        <FilterLink
          href="/admin/messages?filter=flagged"
          active={flaggedOnly}
          count={flaggedCount}
          tone="danger"
        >
          Flagged
        </FilterLink>
      </FilterBar>

      <Section
        id="threads"
        className="mt-6"
        title={flaggedOnly ? "Flagged threads" : "All conversations"}
        count={rows.length}
        tone={flaggedOnly && rows.length > 0 ? "danger" : "neutral"}
        description={
          flaggedOnly
            ? "Each of these contains an attempt to swap contact details or settle off-platform. Read it, then warn or suspend."
            : "Newest activity first, with flagged threads above the rest."
        }
      >
        {flaggedOnly && rows.length === 0 ? (
          // A cleared queue is good news, said quietly.
          <AllClear
            title="Nothing flagged"
            body="Nobody has tried to swap contact details."
          />
        ) : (
          <ThreadList
            threads={rows}
            basePath="/admin/messages"
            empty="No conversations yet."
          />
        )}
      </Section>
    </>
  );
}
