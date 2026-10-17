import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DealPanel } from "@/components/messages/deal-panel";
import { LiveRefresh } from "@/components/messages/live-refresh";
import type { OfferComposerConfig } from "@/components/messages/offer-composer";
import { toMessageViews, toPanelView } from "@/components/messages/serialize";
import { ThreadView } from "@/components/messages/thread-view";
import { dealPanelState } from "@/lib/deal-panel";
import { fromCents } from "@/lib/listing-form";
import { loadPanelInput } from "@/server/deal-panel";
import { getThread, markThreadRead } from "@/server/messages";
import { requireUser } from "@/server/session";
import { getSettings } from "@/server/settings";
import { threadFingerprint } from "@/server/thread-fingerprint";

export const metadata: Metadata = {
  title: "Conversation",
  robots: { index: false, follow: false },
};

/**
 * One conversation: the people, the negotiation and the deal, in one place.
 *
 * Above the timeline sits the one thing the reader can do next, worked out
 * on the server from the same records every other page reads. Nothing here
 * decides what is allowed; each button calls an action that checks again.
 */
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

  const [panelInput, settings] = await Promise.all([
    loadPanelInput(id, thread.viewerRole),
    getSettings(),
  ]);
  const panel = panelInput ? dealPanelState(panelInput) : null;

  const otherSide =
    thread.viewerRole === "buyer" ? thread.sellerName : thread.buyerName;
  const closed = thread.closedAt !== null;

  // The message box offers a number only when the panel says one can be put
  // on the table now, and never in a conversation staff closed — an offer
  // made elsewhere still lands here, but this box is for writing.
  const offerComposer: OfferComposerConfig | null =
    !closed && (panel?.kind === "buy" || panel?.kind === "propose")
      ? {
          mode: panel.kind === "buy" ? "offer" : "price",
          conversationId: thread.id,
          listingId: thread.listingId,
          askingPrice: fromCents(thread.listingPrice),
          expiryHours: settings.offerExpiryHours,
        }
      : null;

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

      {panel ? (
        <div className="mt-5">
          <DealPanel
            // Remounted when the situation changes, so on a phone it opens
            // again the moment it becomes the reader's move.
            key={`${panel.kind}:${"yourMove" in panel ? panel.yourMove : ""}`}
            state={toPanelView(panel)}
            viewerRole={thread.viewerRole}
            otherName={otherSide.split(/\s+/)[0] || otherSide}
            listingSlug={thread.listingSlug}
            dealReference={panelInput?.deal?.reference ?? null}
          />
        </div>
      ) : null}

      <div className="mt-6">
        <ThreadView
          conversationId={thread.id}
          otherSide={otherSide}
          closed={closed}
          viewerRole={thread.viewerRole}
          offerComposer={offerComposer}
          messages={toMessageViews(thread.messages)}
        />
      </div>
    </>
  );
}
