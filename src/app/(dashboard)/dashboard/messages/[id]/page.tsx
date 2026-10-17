import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveRefresh } from "@/components/messages/live-refresh";
import { toMessageViews } from "@/components/messages/serialize";
import { ThreadView } from "@/components/messages/thread-view";
import { getThread, markThreadRead } from "@/server/messages";
import { requireUser } from "@/server/session";
import { threadFingerprint } from "@/server/thread-fingerprint";

export const metadata: Metadata = {
  title: "Conversation",
  robots: { index: false, follow: false },
};

export default async function ThreadPage({
  params,
}: PageProps<"/dashboard/messages/[id]">) {
  const { id } = await params;
  const user = await requireUser(`/dashboard/messages/${id}`);
  // Taken before the thread is read, never after: a change landing between
  // the two would otherwise be in the fingerprint but not on the page, and
  // the poll would never see a reason to redraw it.
  const fingerprint = await threadFingerprint(id, user);
  const thread = await getThread(id, user);

  // `getThread` returns null both for a thread that does not exist and for one
  // this person is not in, so guessing ids tells you nothing either way.
  if (!thread || !fingerprint) notFound();

  await markThreadRead(id, user);

  const otherSide =
    thread.viewerRole === "buyer" ? thread.sellerName : thread.buyerName;

  return (
    <>
      <LiveRefresh conversationId={thread.id} fingerprint={fingerprint} />
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
          viewerRole={thread.viewerRole}
          messages={toMessageViews(thread.messages)}
        />
      </div>
    </>
  );
}
