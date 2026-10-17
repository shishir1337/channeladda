import { ArrowLeftIcon, ExternalLinkIcon, FlagIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Panel } from "@/components/admin/console";
import { StaffControls } from "@/components/messages/staff-controls";
import { ThreadView } from "@/components/messages/thread-view";
import { Badge } from "@/components/ui/badge";
import { getThread } from "@/server/messages";
import { requireStaff } from "@/server/session";

export const metadata: Metadata = {
  title: "Conversation",
  robots: { index: false, follow: false },
};

export default async function AdminThreadPage({
  params,
}: PageProps<"/admin/messages/[id]">) {
  const { id } = await params;
  const staff = await requireStaff();
  const thread = await getThread(id, staff);
  if (!thread) notFound();

  return (
    <>
      <Link
        href="/admin/messages"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        All conversations
      </Link>

      <header className="mt-2 border-b border-line pb-5">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {thread.flaggedAt ? (
                <Badge variant="danger" size="md">
                  <FlagIcon aria-hidden="true" />
                  Flagged
                </Badge>
              ) : null}
              {thread.closedAt ? <Badge size="md">Closed</Badge> : null}
              {thread.staffName ? (
                <Badge variant="info" size="md">
                  Claimed by {thread.staffName}
                </Badge>
              ) : null}
            </div>
            <h1 className="mt-2.5 font-display text-[1.4rem] leading-[1.15] font-black tracking-tight text-fg sm:text-[1.7rem]">
              {thread.buyerName} and {thread.sellerName}
            </h1>
            <Link
              href={`/listing/${thread.listingSlug}`}
              className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-primary-text underline-offset-4 hover:underline"
            >
              {thread.listingHandle} · {thread.listingTitle}
              <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {thread.flaggedAt ? (
        <Panel tone="danger" className="mt-5">
          <p className="flex items-start gap-2 text-sm leading-relaxed text-fg">
            <FlagIcon
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-danger"
            />
            <span>
              <strong className="font-semibold">Flagged.</strong>{" "}
              {thread.flagReason ??
                "Someone tried to move this off the platform."}{" "}
              Taking a deal off Channel Adda is how both sides lose their
              protection, so read the whole thread before deciding.
            </span>
          </p>
        </Panel>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_18rem] lg:items-start">
        <div className="min-w-0">
          <ThreadView
            conversationId={thread.id}
            otherSide={`${thread.buyerName} and ${thread.sellerName}`}
            closed={false}
            messages={thread.messages.map((message) => ({
              ...message,
              createdAt: message.createdAt.toISOString(),
              attachmentExpiresAt:
                message.attachmentExpiresAt?.toISOString() ?? null,
            }))}
          />
          <p className="mt-3 text-xs leading-relaxed text-subtle">
            Anything you write here is sent as Channel Adda, not as {staff.name}
            . Both sides see it.
          </p>
        </div>

        <div className="min-w-0 lg:sticky lg:top-24">
          <StaffControls
            conversationId={thread.id}
            claimedBy={thread.staffName}
            flagged={thread.flaggedAt !== null}
            closed={thread.closedAt !== null}
          />
        </div>
      </div>
    </>
  );
}
