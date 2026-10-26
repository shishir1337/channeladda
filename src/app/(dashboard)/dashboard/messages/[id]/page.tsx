import { ArrowUpRightIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Reference } from "@/components/app/kit";
import { ResellerBadge } from "@/components/app/reseller-badge";
import { AgentInvite } from "@/components/deals/agent-invite";
import { DealComplete } from "@/components/deals/deal-complete";
import {
  dealHeadline,
  STATUS_TONE,
  wordsFor,
} from "@/components/deals/deal-status";
import {
  CancelDeal,
  DealNextStep,
  RaiseDispute,
} from "@/components/deals/deal-timeline";
import { HandoverAccount } from "@/components/deals/handover-account";
import { PayNow } from "@/components/deals/pay-now";
import { PayToCard } from "@/components/deals/pay-to";
import { ReviewPrompts } from "@/components/deals/review-prompts";
import { TrackRecordLine } from "@/components/deals/track-record";
import { StartDeal } from "@/components/listing/start-deal";
import {
  CHAT_FILL,
  CHAT_WINDOW,
  CHAT_WINDOW_WIDE,
} from "@/components/messages/chat-layout";
import { channelOf, ThreadHeader } from "@/components/messages/chat-parts";
import { DealPanel } from "@/components/messages/deal-panel";
import { ListingTabs } from "@/components/messages/listing-tabs";
import { LiveRefresh } from "@/components/messages/live-refresh";
import type { OfferComposerConfig } from "@/components/messages/offer-composer";
import {
  toListingViews,
  toMessageViews,
  toPanelView,
} from "@/components/messages/serialize";
import { ThreadView } from "@/components/messages/thread-view";
import { Badge } from "@/components/ui/badge";
import { mayEndHolds } from "@/lib/custody-roles";
import { db } from "@/lib/db";
import { dealPanelState } from "@/lib/deal-panel";
import { fromCents } from "@/lib/listing-form";
import { withResellerDiscount } from "@/lib/reseller";
import { pickFocus, tabsFor } from "@/lib/thread-focus";
import { threadHref } from "@/lib/thread-href";
import { writesInClosedThread } from "@/lib/thread-rules";
import { cn } from "@/lib/utils";
import { certificateFor } from "@/server/certificate";
import { isConfigured as checkoutConfigured } from "@/server/cryptomus";
import { loadPanelInput } from "@/server/deal-panel";
import { getDealFor, secondApproversFor } from "@/server/deals";
import {
  getThread,
  markThreadRead,
  resolveThreadAlias,
} from "@/server/messages";
import { activeResellers, ratingFor } from "@/server/reseller-status";
import { reviewPromptFor } from "@/server/reviews";
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
 * The 4px of padding keeps focus rings and shadows clear of the scroll
 * edge; no negative margin at the bottom, which is the window's edge — 4px
 * past it scrolled the whole page. `relative` keeps anything absolutely
 * placed inside it (screen-reader labels) inside its scroll, for the same
 * reason. The bottom padding ends the panel level with the message box.
 */
const PANEL_COLUMN =
  "lg:@3xl:relative lg:@3xl:col-start-2 lg:@3xl:row-start-1 lg:@3xl:-mx-1 lg:@3xl:-mt-1 lg:@3xl:min-h-0 lg:@3xl:overflow-y-auto lg:@3xl:overscroll-contain lg:@3xl:px-1 lg:@3xl:pt-1 lg:@3xl:pb-6 lg:@3xl:[scrollbar-width:thin]";

/**
 * On a computer, with room for the deal beside it, the conversation is an
 * app view of the window's height: the header holds the top, the message
 * box holds the bottom, and only the messages scroll between them — the deal
 * panel scrolling on its own beside them. Pinning each of those to a page
 * that scrolled as a whole left the box jumping a few pixels at the end of
 * the page and the panel sliding under the header. Narrower, with the panel
 * stacked above the conversation, the page keeps its own scroll — but is
 * never shorter than the window, so the message box is at its bottom (see
 * chat-layout). With no panel there is nothing to stack, and the window
 * view holds at every computer width.
 *
 * On a phone the page fills the screen, and the negative margin hands back
 * the shell's bottom padding: the message box ends the page, flush with the
 * bottom of the screen, instead of 112px of empty page under it.
 */
function viewFor(withPanel: boolean) {
  return cn(
    CHAT_FILL,
    "max-lg:-mb-28",
    withPanel ? CHAT_WINDOW_WIDE : CHAT_WINDOW,
  );
}

/**
 * One conversation: the people, the negotiation and the deal, in one place.
 *
 * A conversation is one buyer and one seller, about every listing they have
 * talked about. The page is about one of them at a time, the focus
 * (`pickFocus`): the one asked for in the address (`?about=`), else the one
 * where it is the reader's move, else the one talked about last. The header,
 * the deal panel and the message box follow it; with two deals going at
 * once, tabs above the panel switch between them.
 *
 * Above the timeline sits the one thing the reader can do next, worked out
 * on the server from the same records every other page reads. Nothing here
 * decides what is allowed; each button calls an action that checks again.
 */
export default async function ThreadPage({
  params,
  searchParams,
}: PageProps<"/dashboard/messages/[id]">) {
  const { id } = await params;
  const { about } = await searchParams;
  const user = await requireUser(`/dashboard/messages/${id}`);
  // Taken before the thread is read, never after: a change landing between
  // the two would otherwise be in the fingerprint but not on the page, and
  // the poll would never see a reason to redraw it.
  const fingerprint = await threadFingerprint(id, user);
  const thread = await getThread(id, user);

  // `getThread` returns null both for a thread that does not exist and for one
  // this person is not in, so guessing ids tells you nothing either way. A
  // thread from before one conversation per buyer and seller opens the
  // conversation it became, on the listing it was about — for those in it.
  if (!thread || !fingerprint) {
    const moved = await resolveThreadAlias(id, user);
    if (moved) redirect(threadHref(moved.conversationId, moved.listingId));
    // An agent's way into a deal's chat closes with the deal, and the link
    // they were following was a 404 the moment it completed. Their deal's
    // page is still theirs: send them there, with a word on why.
    const ended = await db.order.findFirst({
      where: {
        conversationId: id,
        agentId: user.id,
        ...(typeof about === "string" ? { listingId: about } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (ended) redirect(`/dashboard/deals/${ended.id}?chat=ended`);
    notFound();
  }

  await markThreadRead(id, user);

  // Every listing's panel, for the tabs and to know where it is the
  // reader's move; then the one the page is about.
  const [panelInputs, settings] = await Promise.all([
    Promise.all(
      thread.listings.map(async (listing) => ({
        listingId: listing.id,
        input: await loadPanelInput(id, listing.id, thread.viewerRole),
      })),
    ),
    getSettings(),
  ]);
  const panels = panelInputs.flatMap(({ listingId, input }) =>
    input ? [{ listingId, input, state: dealPanelState(input) }] : [],
  );
  const focusId = pickFocus({
    about,
    listings: thread.listings,
    panels,
    messages: thread.messages,
  });
  const focus =
    thread.listings.find((listing) => listing.id === focusId) ?? null;
  const focused = panels.find((panel) => panel.listingId === focusId);
  const panelInput = focused?.input ?? null;
  const panel = focused?.state ?? null;
  const tabs = tabsFor({ listings: thread.listings, panels, focus: focusId });

  // Only what the panel's card for this state needs, and only then: the
  // deal for a deal state, the balance only when paying.
  const dealId = panelInput?.deal?.id ?? null;
  const deal = dealId ? await getDealFor(user.id, dealId) : null;
  // Only on the deal panel's "finished" state, and only for a deal that
  // went through: everything else ends as it did.
  const certificate =
    deal?.status === "COMPLETED" ? await certificateFor(deal.id) : null;
  // Then the chat asks for reviews: the seller, then Channel Adda.
  const reviewPrompt =
    certificate && deal ? await reviewPromptFor(deal.id, user.id) : null;
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
  // Above the threshold only, and never the agent themselves.
  const staffIds = deal ? await secondApproversFor(deal, user.id) : undefined;

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
    focus && !closed && (panel?.kind === "buy" || panel?.kind === "propose")
      ? {
          mode: panel.kind === "buy" ? "offer" : "price",
          conversationId: thread.id,
          listingId: focus.id,
          askingPrice: fromCents(focus.priceCents),
          expiryHours: settings.offerExpiryHours,
        }
      : null;

  return (
    <div className={viewFor(panel !== null)}>
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
        record={
          otherRecord ? (
            <TrackRecordLine
              record={otherRecord}
              points={otherRating?.points}
            />
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
                    deal.platform,
                    deal.awaitingAgent,
                    deal.status !== "DISPUTED" &&
                      deal.holdUntil !== null &&
                      new Date(deal.holdUntil).getTime() > Date.now(),
                    deal.payToMissing,
                    deal.buyerName,
                  ).label
                }
              </Badge>
              {/* The deal's page, from its reference: one tap, and no
                  second button taking a row of its own on a phone. */}
              <Link
                href={`/dashboard/deals/${deal.id}`}
                className="group inline-flex min-h-8 items-center gap-1.5 rounded-md text-fg transition-colors duration-150 hover:text-primary-text"
              >
                {deal.mode === "SAFEST" ? "Safest" : "Fastest"} deal
                <Reference>{deal.reference}</Reference>
                <ArrowUpRightIcon
                  aria-hidden="true"
                  className="size-3.5 text-subtle transition duration-150 group-hover:translate-x-px group-hover:-translate-y-px"
                />
              </Link>
            </>
          ) : null
        }
      />

      {/* A column — the panel, then the conversation taking the rest of the
          height — until there is room for the panel beside it. */}
      <div
        className={cn(
          "mt-5 flex min-h-0 flex-1 flex-col gap-5",
          panel &&
            "lg:@3xl:grid lg:@3xl:grid-cols-[minmax(0,1fr)_19rem] lg:@3xl:grid-rows-[minmax(0,1fr)] lg:@3xl:gap-6",
        )}
      >
        {panel && focus ? (
          <div className={cn("min-w-0 shrink-0", PANEL_COLUMN)}>
            {tabs.length > 0 ? (
              <ListingTabs
                current={focusId}
                tabs={tabs.map((tab) => {
                  const listing = thread.listings.find(
                    (each) => each.id === tab.listingId,
                  );
                  return {
                    ...tab,
                    title: listing?.title ?? "",
                    reference: listing?.dealReference ?? null,
                    href: threadHref(thread.id, tab.listingId),
                  };
                })}
              />
            ) : null}
            {certificate && deal ? (
              // A deal that went through ends on congratulations and the
              // certificate, not on "This deal has ended".
              <DealComplete
                dealId={deal.id}
                reference={deal.reference}
                viewerRole={deal.viewerRole}
                mode={deal.mode}
                platform={deal.platform}
                completedAt={certificate.completedAt}
                code={
                  deal.viewerRole === "buyer" || deal.viewerRole === "seller"
                    ? certificate.code
                    : null
                }
              />
            ) : (
              <DealPanel
                // Remounted when the situation changes, so on a phone it opens
                // again the moment it becomes the reader's move.
                key={`${focusId}:${panel.kind}:${"yourMove" in panel ? panel.yourMove : ""}`}
                state={toPanelView(panel)}
                viewerRole={thread.viewerRole}
                otherName={otherSide.split(/\s+/)[0] || otherSide}
                listingSlug={focus.slug}
                progress={progress}
                wait={deal?.wait ?? null}
              >
                {panel.kind === "buy" || panel.kind === "start-deal" ? (
                  <StartDeal
                    listingId={focus.id}
                    listingSlug={focus.slug}
                    platform={focus.platform}
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
                  <div className="flex flex-col gap-3">
                    <PayNow
                      orderId={deal.id}
                      reference={deal.reference}
                      amountUsd={deal.totalUsd}
                      priceUsd={deal.priceUsd}
                      mode={deal.mode}
                      availableUsd={wallet.availableUsd}
                      payBy={
                        deal.wait
                          ? new Date(deal.wait.until).toISOString()
                          : null
                      }
                      fromOffer={deal.fromOffer}
                      checkoutOn={checkoutConfigured()}
                      asset={wordsFor(deal.platform).asset}
                    />
                    <CancelDeal deal={deal} />
                  </div>
                ) : panel.kind === "step" && deal ? (
                  <div className="flex flex-col gap-3">
                    <DealNextStep
                      deal={deal}
                      staffIds={staffIds}
                      canEndWait={mayEndHolds(user.role)}
                    />
                    {/* "The account to invite is on this page": it is, here too,
                      straight under the step that needs it. */}
                    <AgentInvite deal={deal} />
                    {/* Safest: where the buyer pays the seller directly, which
                      the chat itself cannot carry. */}
                    <PayToCard deal={deal} />
                    <HandoverAccount
                      dealId={deal.id}
                      viewerRole={deal.viewerRole}
                      mode={deal.mode}
                      platform={deal.platform}
                      handoverTo={deal.handoverTo}
                      open={deal.handoverOpen}
                      inUse={deal.handoverInUse}
                    />
                    <CancelDeal deal={deal} />
                    {deal.nextStep ? <RaiseDispute deal={deal} /> : null}
                  </div>
                ) : panel.kind === "waiting-for-payment" && deal ? (
                  // A Safest seller can say where to be paid from the moment the
                  // deal opens, rather than at the step that needs it.
                  <div className="flex flex-col gap-3">
                    <PayToCard deal={deal} />
                    <CancelDeal deal={deal} />
                  </div>
                ) : null}
              </DealPanel>
            )}
          </div>
        ) : null}

        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col",
            panel && "lg:@3xl:col-start-1 lg:@3xl:row-start-1",
          )}
        >
          <ThreadView
            conversationId={thread.id}
            listings={toListingViews(thread.listings)}
            focusListingId={focusId}
            otherSide={otherSide}
            closed={composerClosed}
            viewerRole={thread.viewerRole}
            offerComposer={offerComposer}
            messages={toMessageViews(thread.messages)}
            after={
              reviewPrompt ? (
                <ReviewPrompts
                  prompt={reviewPrompt}
                  googleReviewUrl={settings.googleReviewUrl}
                />
              ) : null
            }
          />
        </div>
      </div>
    </div>
  );
}
