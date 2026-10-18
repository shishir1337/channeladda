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
 * On a computer the rail is pinned beside the thread at the height of the
 * window, so it stays put while a long conversation scrolls. The negative
 * bottom margin hands back most of the shell's bottom padding, so a short
 * page fits the window exactly instead of scrolling by that padding.
 *
 * The right pane is a size container: the thread page puts its deal panel in
 * a column of its own only when the pane — not the window — is wide enough,
 * which depends on whether the sidebar is collapsed.
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
    <div className="lg:-mb-16 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start lg:gap-6 xl:grid-cols-[20rem_minmax(0,1fr)]">
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

      <section className="@container min-w-0">{children}</section>
    </div>
  );
}
