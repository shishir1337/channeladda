import type { Metadata } from "next";
import Link from "next/link";
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
 * two is about to be defrauded.
 */
export default async function AdminMessagesPage({
  searchParams,
}: PageProps<"/admin/messages">) {
  await requireStaff();
  const { filter } = await searchParams;
  const flaggedOnly = filter === "flagged";

  const threads = await listStaffThreads({ flaggedOnly });

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
      <p className="text-xs font-semibold tracking-[0.14em] text-subtle uppercase">
        Moderation
      </p>
      <h1 className="mt-2 font-display text-3xl font-black tracking-tight text-fg sm:text-4xl">
        Conversations
      </h1>
      <p className="mt-2 max-w-prose text-muted">
        Every thread between a buyer and a seller. You can read all of them and
        write into any of them as Channel Adda.
      </p>

      <div className="mt-5 flex gap-2">
        <Tab href="/admin/messages" active={!flaggedOnly}>
          All
        </Tab>
        <Tab href="/admin/messages?filter=flagged" active={flaggedOnly}>
          Flagged
        </Tab>
      </div>

      <ThreadList
        threads={rows}
        basePath="/admin/messages"
        empty={
          flaggedOnly
            ? "Nothing flagged. Nobody has tried to swap contact details."
            : "No conversations yet."
        }
      />
    </>
  );
}

function Tab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
        active
          ? "border-primary/40 bg-primary-soft font-medium text-primary-text"
          : "border-line text-muted hover:text-fg"
      }`}
    >
      {children}
    </Link>
  );
}
