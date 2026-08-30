import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ThreadView } from "@/components/messages/thread-view";
import { getThread, markThreadRead } from "@/server/messages";
import { requireUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Conversation",
  robots: { index: false, follow: false },
};

export default async function ThreadPage({
  params,
}: PageProps<"/dashboard/messages/[id]">) {
  const { id } = await params;
  const user = await requireUser(`/dashboard/messages/${id}`);
  const thread = await getThread(id, user);

  // `getThread` returns null both for a thread that does not exist and for one
  // this person is not in, so guessing ids tells you nothing either way.
  if (!thread) notFound();

  await markThreadRead(id, user);

  const otherSide =
    thread.viewerRole === "buyer" ? thread.sellerName : thread.buyerName;

  return (
    <>
      <Link
        href="/dashboard/messages"
        className="inline-flex items-center gap-1.5 text-sm text-subtle transition-colors hover:text-fg"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        All messages
      </Link>

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="font-display text-2xl font-black tracking-tight text-fg">
          {otherSide}
        </h1>
        <Link
          href={`/listing/${thread.listingSlug}`}
          className="text-sm text-primary-text underline-offset-4 hover:underline"
        >
          {thread.listingHandle} · {thread.listingTitle}
        </Link>
      </div>

      <div className="mt-6">
        <ThreadView
          conversationId={thread.id}
          otherSide={otherSide}
          closed={thread.closedAt !== null}
          messages={thread.messages.map((message) => ({
            ...message,
            createdAt: message.createdAt.toISOString(),
          }))}
        />
      </div>
    </>
  );
}
