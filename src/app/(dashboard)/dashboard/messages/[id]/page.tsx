import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { STATUS_LABELS, STATUS_TONE } from "@/components/deals/deal-status";
import { DealNextStep, RaiseDispute } from "@/components/deals/deal-timeline";
import { PayNow } from "@/components/deals/pay-now";
import { PayToCard } from "@/components/deals/pay-to";
import { StartDeal } from "@/components/listing/start-deal";
import { DealPanel } from "@/components/messages/deal-panel";
import { LiveRefresh } from "@/components/messages/live-refresh";
import type { OfferComposerConfig } from "@/components/messages/offer-composer";
import { toMessageViews, toPanelView } from "@/components/messages/serialize";
import { ThreadView } from "@/components/messages/thread-view";
import { Badge } from "@/components/ui/badge";
import { dealPanelState } from "@/lib/deal-panel";
import { fromCents } from "@/lib/listing-form";
import { loadPanelInput } from "@/server/deal-panel";
import { getDealFor } from "@/server/deals";
import { getThread, markThreadRead } from "@/server/messages";
import { requireUser } from "@/server/session";
import { getSettings } from "@/server/settings";
import { threadFingerprint } from "@/server/thread-fingerprint";
import { getWallet } from "@/server/wallet";

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

  // Only what the panel's card for this state needs, and only then: the
  // deal for a deal state, the balance only when paying.
  const dealId = panelInput?.deal?.id ?? null;
  const deal = dealId ? await getDealFor(user.id, dealId) : null;
  const wallet =
    panel?.kind === "pay" && deal ? await getWallet(user.id) : null;

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

      {deal ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Badge
            variant={STATUS_TONE[deal.status]}
            size="sm"
            className="max-w-full whitespace-normal"
          >
            {STATUS_LABELS[deal.status]}
          </Badge>
          <span className="tnum text-xs text-subtle">
            {deal.mode === "SAFEST" ? "Safest" : "Fastest"} deal ·{" "}
            {deal.reference}
          </span>
          <Link
            href={`/dashboard/deals/${deal.id}`}
            className="text-xs font-medium text-primary-text underline-offset-4 hover:underline"
          >
            Deal page
          </Link>
        </div>
      ) : null}

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
          >
            {panel.kind === "buy" || panel.kind === "start-deal" ? (
              <StartDeal
                listingId={thread.listingId}
                listingSlug={thread.listingSlug}
                // The held price when one was agreed, as createDeal will use.
                price={fromCents(
                  panel.kind === "start-deal"
                    ? panel.priceCents
                    : panel.askingCents,
                )}
                // The rates only: the rest of the settings has no business
                // in the browser.
                fees={{
                  buyerFeeBpSafest: settings.buyerFeeBpSafest,
                  buyerFeeBpFastest: settings.buyerFeeBpFastest,
                  sellerFeeBp: settings.sellerFeeBp,
                }}
                isOwnListing={false}
                after="refresh"
              />
            ) : panel.kind === "pay" && deal && wallet ? (
              <PayNow
                orderId={deal.id}
                totalUsd={deal.totalUsd}
                priceUsd={deal.priceUsd}
                mode={deal.mode}
                availableUsd={wallet.availableUsd}
              />
            ) : panel.kind === "step" && deal ? (
              <div className="flex flex-col gap-4">
                <DealNextStep deal={deal} />
                <PayToCard deal={deal} />
                {deal.nextStep ? <RaiseDispute deal={deal} /> : null}
              </div>
            ) : panel.kind === "waiting-for-payment" && deal ? (
              // A Safest seller can say where to be paid from the moment the
              // deal opens, rather than at the step that needs it.
              <PayToCard deal={deal} />
            ) : null}
          </DealPanel>
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
