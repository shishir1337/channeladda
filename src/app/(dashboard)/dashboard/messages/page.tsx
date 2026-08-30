import type { Metadata } from "next";
import Link from "next/link";
import { ThreadList, type ThreadRow } from "@/components/messages/thread-list";
import { listThreads } from "@/server/messages";
import { requireUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Messages",
  robots: { index: false, follow: false },
};

/**
 * The inbox.
 *
 * One list for both sides of the account, since everyone here buys and sells.
 * The listing each thread is about is on every row, because "Nadia Hassan" on
 * its own means nothing to someone running eight conversations.
 */
export default async function MessagesPage() {
  const user = await requireUser("/dashboard/messages");
  const threads = await listThreads(user);

  const rows: ThreadRow[] = threads.map((thread) => ({
    id: thread.id,
    listingTitle: thread.listingTitle,
    listingHandle: thread.listingHandle,
    withName: thread.withName,
    lastMessageAt: thread.lastMessageAt.toISOString(),
    preview: thread.preview,
    unread: thread.unread,
    flagged: thread.flagged,
    closed: thread.closed,
  }));

  return (
    <>
      <p className="text-xs font-semibold tracking-[0.14em] text-subtle uppercase">
        Conversations
      </p>
      <h1 className="mt-2 font-display text-3xl font-black tracking-tight text-fg sm:text-4xl">
        Messages
      </h1>
      <p className="mt-2 max-w-prose text-muted">
        Every conversation about a listing lives here, and Channel Adda can read
        all of them. That is deliberate: if a deal goes wrong we can see what
        was actually agreed.
      </p>

      <ThreadList
        threads={rows}
        basePath="/dashboard/messages"
        empty="No conversations yet. Open a listing and ask the seller a question."
      />

      <p className="mt-10 text-sm text-subtle">
        Looking for something to buy?{" "}
        <Link
          href="/browse"
          className="font-medium text-primary-text underline-offset-4 hover:underline"
        >
          Browse accounts
        </Link>
        .
      </p>
    </>
  );
}
