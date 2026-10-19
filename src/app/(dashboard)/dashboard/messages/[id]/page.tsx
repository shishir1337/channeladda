import { ArrowUpRightIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Reference } from "@/components/app/kit";
import { ResellerBadge } from "@/components/app/reseller-badge";
import { AgentInvite } from "@/components/deals/agent-invite";
import { dealHeadline, STATUS_TONE } from "@/components/deals/deal-status";
import { DealNextStep, RaiseDispute } from "@/components/deals/deal-timeline";
import { HandoverAccount } from "@/components/deals/handover-account";
import { PayNow } from "@/components/deals/pay-now";
import { TrackRecordLine } from "@/components/deals/track-record";
import { StartDeal } from "@/components/listing/start-deal";
import { channelOf, ThreadHeader } from "@/components/messages/chat-parts";
import { DealPanel } from "@/components/messages/deal-panel";
import { LiveRefresh } from "@/components/messages/live-refresh";
import type { OfferComposerConfig } from "@/components/messages/offer-composer";
import { toMessageViews, toPanelView } from "@/components/messages/serialize";
import { ThreadView } from "@/components/messages/thread-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { dealPanelState } from "@/lib/deal-panel";
import { templateFor } from "@/lib/deal-templates";
import { fromCents } from "@/lib/listing-form";
import { withResellerDiscount } from "@/lib/reseller";
import { writesInClosedThread } from "@/lib/thread-rules";
import { cn } from "@/lib/utils";
import { loadPanelInput } from "@/server/deal-panel";
import { getDealFor } from "@/server/deals";
import { getThread, markThreadRead } from "@/server/messages";
import { activeResellers, ratingFor } from "@/server/reseller-status";
import { requireUser } from "@/server/session";
import { getSettings } from "@/server/settings";
import { threadFingerprint } from "@/server/thread-fingerprint";
import { trackRecord } from "@/server/track-record";
import { getWallet } from "@/server/wallet";

export const metadata: Metadata = {
  title: "Conversation",
  robots: { index: false, follow: false },
};

/**
 * Where the deal panel goes once the pane is wide enough for two columns:
 * on the right, pinned under the top bar while the conversation scrolls, and
 * scrolling on its own when it is taller than the window. The pane is the
 * size container (see the messages layout), so this follows the sidebar.
 */
const PANEL_COLUMN =
  "lg:@3xl:col-start-2 lg:@3xl:row-start-1 lg:@3xl:-m-1 lg:@3xl:min-h-0 lg:@3xl:overflow-y-auto lg:@3xl:overscroll-contain lg:@3xl:p-1 lg:@3xl:[scrollbar-width:thin]";

/**
 * On a computer, with room for the deal beside it, the conversation is an
 * app view of the window's height: the header holds the top, the message
 * box holds the bottom, and only the messages scroll between them — the deal
 * panel scrolling on its own beside them. Pinning each of those to a page
 * that scrolled as a whole left the box jumping a few pixels at the end of
 * the page and the panel sliding under the header. Narrower layouts keep the
 * page's own scroll, where stacking makes that the only sensible choice.
 */
const FIXED_VIEW =
  "lg:@3xl:flex lg:@3xl:h-[calc(100dvh-6.5rem)] lg:@3xl:flex-col";
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
  // How far the deal has got, for the ring on the panel — counted from the
  // deal just loaded, not asked for again.
  const progress = deal
    ? {
        done: deal.steps.filter((step) => step.completedAt !== null).length,
        total: deal.steps.length,
      }
    : null;
  // As the deal page does it: only the agent is ever asked to name a second
  // approver, only on the step that hands value across, and nobody else is
  // shown the list.
  const staffIds =
    deal?.viewerRole === "agent" &&
    deal.nextStep?.actor === "agent" &&
    templateFor(deal.mode).find(
      (step) => step.position === deal.nextStep?.position,
    )?.needsApprovalAbove
      ? await db.user.findMany({
          where: {
            role: { in: ["MODERATOR", "FINANCE", "SUPERADMIN"] },
            bannedAt: null,
          },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : undefined;

  // The agent of the deal and staff are talking to both of them.
  const otherSide =
    thread.viewerRole === "buyer"
      ? thread.sellerName
      : thread.viewerRole === "seller"
        ? thread.buyerName
        : `${thread.buyerName} and ${thread.sellerName}`;
  // Each side sees the other's completed deals before agreeing to anything.
  const otherId =
    thread.viewerRole === "buyer"
      ? thread.sellerId
      : thread.viewerRole === "seller"
        ? thread.buyerId
        : null;
  const viewerIsReseller =
    thread.viewerRole === "buyer" &&
    (await activeResellers([user.id])).has(user.id);
  const [otherRecord, otherRating] = otherId
    ? await Promise.all([trackRecord(otherId), ratingFor(otherId)])
    : [null, null];
  const closed = thread.closedAt !== null;
  // The message box is closed only to those the server would refuse: the
  // deal's agent and staff can still write in a closed conversation.
  const composerClosed = closed && !writesInClosedThread(thread.viewerRole);

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
    <div className={FIXED_VIEW}>
      <LiveRefresh conversationId={thread.id} fingerprint={fingerprint} />

      <ThreadHeader
        back={{
          href: "/dashboard/messages",
          label: "All messages",
          phoneOnly: true,
        }}
        people={
          thread.viewerRole === "buyer" || thread.viewerRole === "seller"
            ? [otherSide]
            : [thread.buyerName, thread.sellerName]
        }
        title={
          otherRating?.reseller ? (
            <span className="inline-flex max-w-full items-center gap-2">
              <span className="truncate sm:overflow-visible sm:whitespace-normal">
                {otherSide}
              </span>
              <ResellerBadge />
            </span>
          ) : (
            otherSide
          )
        }
        listing={{
          href: `/listing/${thread.listingSlug}`,
          handle: thread.listingHandle,
          title: thread.listingTitle,
        }}
        channel={channelOf(thread.listingPlatform, thread.listingSourceUrl)}
        record={
          otherRecord ? (
            <TrackRecordLine
              record={otherRecord}
              points={otherRating?.points}
            />
          ) : null
        }
        actions={
          deal ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={`/dashboard/deals/${deal.id}`}>
                Deal page
                <ArrowUpRightIcon aria-hidden="true" />
              </Link>
            </Button>
          ) : null
        }
        meta={
          deal ? (
            <>
              <Badge
                variant={STATUS_TONE[deal.status]}
                size="sm"
                className="max-w-full whitespace-normal app:h-auto app:min-h-5 app:py-0.5 app:leading-4"
              >
                {
                  dealHeadline(
                    deal.status,
                    deal.mode,
                    deal.viewerRole,
                    deal.nextStep?.position ?? null,
                  ).label
                }
              </Badge>
              <span className="inline-flex items-center gap-1.5">
                {deal.mode === "SAFEST" ? "Safest" : "Fastest"} deal
                <Reference>{deal.reference}</Reference>
              </span>
            </>
          ) : null
        }
      />

      <div
        className={cn(
          "mt-5 grid gap-5 lg:@3xl:min-h-0 lg:@3xl:flex-1 lg:@3xl:grid-rows-[minmax(0,1fr)]",
          panel && "lg:@3xl:grid-cols-[minmax(0,1fr)_19rem] lg:@3xl:gap-6",
        )}
      >
        {panel ? (
          <div className={cn("min-w-0", PANEL_COLUMN)}>
            <DealPanel
              // Remounted when the situation changes, so on a phone it opens
              // again the moment it becomes the reader's move.
              key={`${panel.kind}:${"yourMove" in panel ? panel.yourMove : ""}`}
              state={toPanelView(panel)}
              viewerRole={thread.viewerRole}
              otherName={otherSide.split(/\s+/)[0] || otherSide}
              listingSlug={thread.listingSlug}
              dealReference={panelInput?.deal?.reference ?? null}
              progress={progress}
              wait={deal?.wait ?? null}
            >
              {panel.kind === "buy" || panel.kind === "start-deal" ? (
                <StartDeal
                  listingId={thread.listingId}
                  listingSlug={thread.listingSlug}
                  platform={thread.listingPlatform}
                  // The held price when one was agreed, as createDeal will use.
                  price={fromCents(
                    panel.kind === "start-deal"
                      ? panel.priceCents
                      : panel.askingCents,
                  )}
                  // The rates only: the rest of the settings has no business
                  // in the browser. A Reseller badge holder's are already
                  // discounted, so the quote is what the deal will cost.
                  fees={withResellerDiscount(
                    settings,
                    { buyer: viewerIsReseller, seller: false },
                    settings.resellerDiscountBp,
                  )}
                  isOwnListing={false}
                  after="refresh"
                />
              ) : panel.kind === "pay" && deal && wallet ? (
                <PayNow
                  orderId={deal.id}
                  amountUsd={deal.totalUsd}
                  priceUsd={deal.priceUsd}
                  mode={deal.mode}
                  availableUsd={wallet.availableUsd}
                />
              ) : panel.kind === "step" && deal ? (
                <div className="flex flex-col gap-3">
                  <DealNextStep deal={deal} staffIds={staffIds} />
                  {/* "The address to invite is on this page": it is, here too. */}
                  <AgentInvite deal={deal} />
                  <HandoverAccount
                    dealId={deal.id}
                    viewerRole={deal.viewerRole}
                    mode={deal.mode}
                    platform={deal.platform}
                    handoverTo={deal.handoverTo}
                    open={deal.handoverOpen}
                    inUse={deal.handoverInUse}
                  />
                  {deal.nextStep ? <RaiseDispute deal={deal} /> : null}
                </div>
              ) : null}
            </DealPanel>
          </div>
        ) : null}

        <div
          className={cn(
            "min-w-0 lg:@3xl:flex lg:@3xl:min-h-0 lg:@3xl:flex-col",
            panel && "lg:@3xl:col-start-1 lg:@3xl:row-start-1",
          )}
        >
          <ThreadView
            conversationId={thread.id}
            otherSide={otherSide}
            closed={composerClosed}
            viewerRole={thread.viewerRole}
            offerComposer={offerComposer}
            messages={toMessageViews(thread.messages)}
          />
        </div>
      </div>
    </div>
  );
}
