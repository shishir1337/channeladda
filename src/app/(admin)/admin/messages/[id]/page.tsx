import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StaffControls } from "@/components/messages/staff-controls";
import { ThreadView } from "@/components/messages/thread-view";
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
        className="inline-flex items-center gap-1.5 text-sm text-subtle transition-colors hover:text-fg"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        All conversations
      </Link>

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="font-display text-2xl font-black tracking-tight text-fg">
          {thread.buyerName} and {thread.sellerName}
        </h1>
        <Link
          href={`/listing/${thread.listingSlug}`}
          className="text-sm text-primary-text underline-offset-4 hover:underline"
        >
          {thread.listingHandle} · {thread.listingTitle}
        </Link>
      </div>

      {thread.flaggedAt ? (
        <p className="mt-4 rounded-panel border border-danger/30 bg-danger-soft p-3.5 text-sm text-fg">
          <strong className="font-semibold">Flagged.</strong>{" "}
          {thread.flagReason ?? "Someone tried to move this off the platform."}
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_18rem] lg:items-start">
        <ThreadView
          conversationId={thread.id}
          otherSide={`${thread.buyerName} and ${thread.sellerName}`}
          closed={false}
          messages={thread.messages.map((message) => ({
            ...message,
            createdAt: message.createdAt.toISOString(),
          }))}
        />

        <div className="lg:sticky lg:top-24">
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
