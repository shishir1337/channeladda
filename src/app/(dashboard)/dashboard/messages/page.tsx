import { MailOpenIcon, MessagesSquareIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { listThreads } from "@/server/messages";
import { requireUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Messages",
  robots: { index: false, follow: false },
};

/**
 * On a computer the pane is the height of the rail beside it and drawn
 * without a frame, so it reads as the space a conversation will open into.
 * On a phone it is an ordinary card under (or instead of) the list.
 */
const PANE =
  "justify-center lg:min-h-[calc(100dvh-6.5rem)] lg:border-transparent lg:bg-transparent lg:shadow-none";

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
        as="h2"
        className={PANE}
        icon={MessagesSquareIcon}
        title="No conversations yet"
        body="Ask a question on any listing and the thread starts here."
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
        as="h2"
        className={PANE}
        icon={MailOpenIcon}
        title={`${unread.length} ${unread.length === 1 ? "conversation needs" : "conversations need"} a reply`}
        body="Start with the one that has been waiting longest."
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
      as="h2"
      // The list is right above it on a phone; this would only repeat it.
      className={`${PANE} max-lg:hidden`}
      icon={MessagesSquareIcon}
      // The title says it all; the list it points to is right beside it.
      title="Pick a conversation"
    />
  );
}
