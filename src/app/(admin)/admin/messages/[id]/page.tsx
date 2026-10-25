import { FlagIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Callout } from "@/components/app/kit";
import { CHAT_WINDOW_WIDE } from "@/components/messages/chat-layout";
import { channelOf, ThreadHeader } from "@/components/messages/chat-parts";
import { LiveRefresh } from "@/components/messages/live-refresh";
import { toMessageViews } from "@/components/messages/serialize";
import { StaffControls } from "@/components/messages/staff-controls";
import { ThreadView } from "@/components/messages/thread-view";
import { Badge } from "@/components/ui/badge";
import { getThread } from "@/server/messages";
import { requireStaff } from "@/server/session";
import { threadFingerprint } from "@/server/thread-fingerprint";

export const metadata: Metadata = {
  title: "Conversation",
  robots: { index: false, follow: false },
};

export default async function AdminThreadPage({
  params,
}: PageProps<"/admin/messages/[id]">) {
  const { id } = await params;
  const staff = await requireStaff();
  // Before the thread is read, for the reason the dashboard page gives.
  const fingerprint = await threadFingerprint(id, staff);
  const thread = await getThread(id, staff);
  if (!thread || !fingerprint) notFound();

  // The listing the page is about: the one the newest line is about.
  const lastListing = thread.messages.at(-1)?.listingId;
  const focus =
    thread.listings.find((listing) => listing.id === lastListing) ??
    thread.listings[0] ??
    null;
  const flagged = thread.flaggedAt !== null;
  const closed = thread.closedAt !== null;

  return (
    // The same window-height view as the member thread: header on top,
    // message box at the bottom, only the messages scrolling between, and
    // the staff controls scrolling on their own. The container decides, so a
    // narrow layout keeps the page's own scroll — at least the window's
    // height, with the message box at its bottom (see chat-layout). On a
    // phone the staff controls follow the conversation, so the page keeps
    // the shell's bottom padding.
    <div className="@container lg:-mb-16">
      <div className={CHAT_WINDOW_WIDE}>
        <LiveRefresh conversationId={thread.id} fingerprint={fingerprint} />

        <ThreadHeader
          back={{ href: "/admin/messages", label: "All conversations" }}
          people={[thread.buyerName, thread.sellerName]}
          title={`${thread.buyerName} and ${thread.sellerName}`}
          listing={
            focus
              ? {
                  href: focus.onSale ? `/listing/${focus.slug}` : null,
                  handle: focus.handle,
                  title: focus.title,
                }
              : null
          }
          channel={focus ? channelOf(focus.platform, focus.sourceUrl) : null}
          meta={
            flagged || closed || thread.staffName ? (
              <>
                {flagged ? (
                  <Badge variant="danger" size="sm">
                    <FlagIcon aria-hidden="true" />
                    Flagged
                  </Badge>
                ) : null}
                {closed ? <Badge size="sm">Closed</Badge> : null}
                {thread.staffName ? (
                  <Badge variant="info" size="sm">
                    Claimed by {thread.staffName}
                  </Badge>
                ) : null}
              </>
            ) : null
          }
        />

        {flagged ? (
          // The reason is the headline: "Flagged" is already the badge in the
          // header above, and the flag icon says it again.
          <Callout
            tone="danger"
            icon={FlagIcon}
            title={
              thread.flagReason ??
              "Someone tried to move this off the platform."
            }
            className="mt-5"
          >
            Taking a deal off Channel Adda is how both sides lose their
            protection, so read the whole thread before deciding.
          </Callout>
        ) : null}

        <div className="mt-5 grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_18rem] lg:grid-rows-[minmax(0,1fr)] lg:gap-6">
          <div className="flex min-h-0 min-w-0 flex-col">
            <ThreadView
              conversationId={thread.id}
              listingId={focus?.id ?? null}
              otherSide={`${thread.buyerName} and ${thread.sellerName}`}
              closed={false}
              viewerRole="staff"
              messages={toMessageViews(thread.messages)}
              footnote={
                <>
                  Anything you write here is sent as Channel Adda, not as{" "}
                  {staff.name}. Both sides see it.
                </>
              }
            />
          </div>

          {/* No negative margin at the bottom, the window's edge: 4px past
              it scrolled the whole page. `relative` keeps screen-reader
              labels inside its scroll, for the same reason. */}
          <div className="min-w-0 lg:@3xl:relative lg:@3xl:-mx-1 lg:@3xl:-mt-1 lg:@3xl:min-h-0 lg:@3xl:overflow-y-auto lg:@3xl:overscroll-contain lg:@3xl:px-1 lg:@3xl:pt-1 lg:@3xl:pb-6 lg:@3xl:[scrollbar-width:thin]">
            <StaffControls
              conversationId={thread.id}
              claimedBy={thread.staffName}
              flagged={flagged}
              closed={closed}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
