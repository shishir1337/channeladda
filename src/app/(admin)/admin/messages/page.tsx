import type { Metadata } from "next";
import {
  ConsoleHeader,
  ConsoleSection,
  FilterBar,
  FilterLink,
  MetaItem,
} from "@/components/admin/console";
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
      <ConsoleHeader
        eyebrow="Moderation"
        title="Conversations"
        description="Every thread between a buyer and a seller. You can read all of them and write into any of them as Channel Adda."
        meta={
          <>
            <MetaItem label="Signed in as">{staff.name}</MetaItem>
            <MetaItem label="Showing">
              {rows.length.toLocaleString("en-US")}{" "}
              {rows.length === 1 ? "thread" : "threads"}
            </MetaItem>
            {flaggedCount > 0 ? (
              <span className="font-semibold text-danger">
                {flaggedCount} flagged
              </span>
            ) : (
              <span className="text-verified">nothing flagged</span>
            )}
          </>
        }
      />

      <div className="mt-5">
        <FilterBar label="Filter conversations">
          <FilterLink href="/admin/messages" active={!flaggedOnly}>
            All
          </FilterLink>
          <FilterLink
            href="/admin/messages?filter=flagged"
            active={flaggedOnly}
            count={flaggedCount}
          >
            Flagged
          </FilterLink>
        </FilterBar>
      </div>

      <ConsoleSection
        id="threads"
        title={flaggedOnly ? "Flagged threads" : "All conversations"}
        count={rows.length}
        tone={flaggedOnly && rows.length > 0 ? "danger" : "neutral"}
        description={
          flaggedOnly
            ? "Each of these contains an attempt to swap contact details or settle off-platform. Read it, then warn or suspend."
            : "Newest activity first, with flagged threads above the rest."
        }
      >
        <ThreadList
          threads={rows}
          basePath="/admin/messages"
          empty={
            flaggedOnly
              ? "Nothing flagged. Nobody has tried to swap contact details."
              : "No conversations yet."
          }
        />
      </ConsoleSection>
    </>
  );
}
