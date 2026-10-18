import { FlagIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Callout } from "@/components/app/kit";
import { ThreadHeader } from "@/components/messages/chat-parts";
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

  const flagged = thread.flaggedAt !== null;
  const closed = thread.closedAt !== null;

  return (
    <>
      <LiveRefresh conversationId={thread.id} fingerprint={fingerprint} />

      <ThreadHeader
        back={{ href: "/admin/messages", label: "All conversations" }}
        people={[thread.buyerName, thread.sellerName]}
        title={`${thread.buyerName} and ${thread.sellerName}`}
        listing={{
          href: `/listing/${thread.listingSlug}`,
          handle: thread.listingHandle,
          title: thread.listingTitle,
        }}
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
        <Callout tone="danger" icon={FlagIcon} title="Flagged" className="mt-5">
          {thread.flagReason ?? "Someone tried to move this off the platform."}{" "}
          Taking a deal off Channel Adda is how both sides lose their
          protection, so read the whole thread before deciding.
        </Callout>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-6">
        <div className="min-w-0">
          <ThreadView
            conversationId={thread.id}
            otherSide={`${thread.buyerName} and ${thread.sellerName}`}
            closed={false}
            viewerRole="staff"
            messages={toMessageViews(thread.messages)}
          />
          <p className="mt-2 px-1 text-xs leading-relaxed text-subtle">
            Anything you write here is sent as Channel Adda, not as {staff.name}
            . Both sides see it.
          </p>
        </div>

        <div className="min-w-0 lg:sticky lg:top-[5.5rem]">
          <StaffControls
            conversationId={thread.id}
            claimedBy={thread.staffName}
            flagged={flagged}
            closed={closed}
          />
        </div>
      </div>
    </>
  );
}
