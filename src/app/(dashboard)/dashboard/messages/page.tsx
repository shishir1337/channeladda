import { MailOpenIcon, MessagesSquareIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { listThreads } from "@/server/messages";
import { requireUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Messages",
  robots: { index: false, follow: false },
};

/**
 * The empty right-hand pane.
 *
 * The conversation list is in the layout, so this page is only ever what you
 * see before picking one. It says what the inbox is for rather than repeating
 * the list that is already on screen beside it — and when something is
 * actually waiting, it offers the thread instead of describing the feature.
 */
export default async function MessagesPage() {
  const user = await requireUser("/dashboard/messages");
  const threads = await listThreads(user);
  const unread = threads.filter((thread) => thread.unread > 0);
  const oldestUnread = unread.at(-1);

  if (threads.length === 0) {
    return (
      <EmptyState
        className="min-h-[22rem] justify-center"
        icon={MessagesSquareIcon}
        title="No conversations yet"
        description="Ask a question on any listing and the thread starts here. Every conversation is readable by Channel Adda, which is what lets us settle a dispute on the record."
        action={
          <Button asChild size="md">
            <Link href="/browse">Browse accounts</Link>
          </Button>
        }
      />
    );
  }

  if (oldestUnread) {
    return (
      <EmptyState
        className="min-h-[22rem] justify-center"
        icon={MailOpenIcon}
        title={`${unread.length} ${unread.length === 1 ? "conversation needs" : "conversations need"} a reply`}
        description="A buyer who waits a day usually buys somewhere else. Start with the one that has been waiting longest."
        action={
          <Button asChild size="md">
            <Link href={`/dashboard/messages/${oldestUnread.id}`}>
              Reply to {oldestUnread.withName.split(/\s+/)[0]}
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <EmptyState
      className="min-h-[22rem] justify-center"
      icon={MessagesSquareIcon}
      title="Pick a conversation"
      description="Choose one from your conversations to read it and reply. Photos and clips are deleted after 48 hours, and a thread with no deal attached clears after 10 days."
    />
  );
}
