import Link from "next/link";
import { ThreadRail } from "@/components/messages/thread-rail";
import { listThreads } from "@/server/messages";
import { getCurrentUser } from "@/server/session";

/**
 * The inbox, as two panes.
 *
 * The thread list lives in the layout rather than on the index page, so moving
 * between conversations keeps the list on screen and does not re-fetch it.
 * That is the whole difference between this and a list of links: somebody
 * running eight conversations can see all eight while answering one.
 *
 * On a phone there is no room for both, so the rail collapses and the open
 * thread takes the screen — the list is one tap away rather than permanently
 * stealing a third of the width.
 *
 * Deliberately not `requireUser()`: a layout does not know which page is
 * rendering inside it, so redirecting from here would send people to /signin
 * with no way back. Each page does its own redirect and that one wins.
 */
export default async function MessagesLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  if (!user) return <>{children}</>;

  const threads = await listThreads(user);

  return (
    <div className="-mt-2 flex min-h-[calc(100vh-10rem)] flex-col lg:grid lg:grid-cols-[minmax(0,20rem)_1fr] lg:gap-6">
      <aside className="lg:border-r lg:border-line lg:pr-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-sm font-semibold text-fg">
            Conversations
          </h2>
          <Link
            href="/browse"
            className="text-xs text-primary-text underline-offset-4 hover:underline"
          >
            Find more
          </Link>
        </div>
        <ThreadRail
          threads={threads.map((thread) => ({
            id: thread.id,
            listingTitle: thread.listingTitle,
            listingHandle: thread.listingHandle,
            withName: thread.withName,
            lastMessageAt: thread.lastMessageAt.toISOString(),
            preview: thread.preview,
            unread: thread.unread > 0,
            flagged: thread.flagged,
            closed: thread.closed,
          }))}
        />
      </aside>

      <section className="mt-6 min-w-0 lg:mt-0">{children}</section>
    </div>
  );
}
