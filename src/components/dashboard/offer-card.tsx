"use client";

import { ClockIcon, MessagesSquareIcon } from "lucide-react";
import Link from "next/link";
import { Callout, Meter, TurnFlag } from "@/components/app/kit";
import { OFFER_STATUS } from "@/components/deals/offer-status";
import { OfferActions } from "@/components/offers/offer-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OfferStatus } from "@/generated/prisma/enums";
import { timeLeft } from "@/lib/chat-time";
import { threadHref } from "@/lib/thread-href";
import { cn } from "@/lib/utils";

export type OfferCardData = {
  id: string;
  /** The listing it is on: its conversation opens there. */
  listingId: string;
  listingSlug: string;
  listingTitle: string;
  listingHandle: string;
  listingPrice: number;
  amount: number;
  effectiveStatus: OfferStatus;
  bySeller: boolean;
  message: string | null;
  expiresAt: string;
  createdAt: string;
  buyerName: string;
  sellerName: string;
  awaiting: "buyer" | "seller" | null;
  /** The offer this one countered; null for an opening offer or price. */
  counterOf: string | null;
  /** Where the negotiation is happening, when it has a conversation. */
  conversationId: string | null;
};

const STATUS = OFFER_STATUS;

function usd(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * One offer, from whichever side is looking at it.
 *
 * `viewingAs` is what the viewer is on *this* listing. It decides the wording
 * and which buttons appear — but never what is allowed: the server works the
 * side out again from the listing before acting. Not called `role`, which
 * would read as the ARIA attribute on a component.
 */
export function OfferCard({
  offer,
  viewingAs,
}: {
  offer: OfferCardData;
  viewingAs: "buyer" | "seller";
}) {
  const status = STATUS[offer.effectiveStatus];
  // Someone taking the asking price is not haggling, and a seller should be
  // able to see that at a glance rather than comparing two numbers.
  const atAskingPrice = offer.amount >= offer.listingPrice;
  const yourTurn = offer.awaiting === viewingAs;
  const theirName = viewingAs === "seller" ? offer.buyerName : offer.sellerName;
  const open = offer.effectiveStatus === "OPEN";
  // Declined, countered, lapsed or withdrawn: still worth seeing, but it is
  // history, and should not compete with the offers that are live.
  const past = !open && offer.effectiveStatus !== "ACCEPTED";
  // When `OfferActions` draws anything — an open offer somebody is waiting
  // on — so the column for its buttons only takes room when it has some.
  const hasActions = open && offer.awaiting !== null;
  // How close the figure is to the asking price, seen as a bar before it is
  // read. Floored, so an offer a dollar short never claims 100%.
  const fullAsk = atAskingPrice && !offer.bySeller;
  const share =
    offer.listingPrice > 0
      ? Math.floor((offer.amount / offer.listingPrice) * 100)
      : null;

  return (
    <li className="px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span
              className={cn(
                "text-[1.375rem] leading-7 font-semibold tracking-[-0.02em] tabular-nums",
                past ? "text-muted" : "text-fg",
              )}
            >
              {usd(offer.amount)}
            </span>
            <span
              className={
                fullAsk
                  ? "text-xs font-medium text-verified"
                  : "text-xs text-subtle"
              }
            >
              {offer.bySeller
                ? // Whose it is depends on who is reading: the seller looking
                  // at their own counter was told it was "their counter".
                  offer.counterOf
                  ? viewingAs === "seller"
                    ? "your counter"
                    : "their counter"
                  : viewingAs === "seller"
                    ? "your price"
                    : "their price"
                : atAskingPrice
                  ? "full asking price"
                  : "offered"}
            </span>
          </div>

          {share !== null ? (
            <div className="mt-1.5 flex max-w-[15rem] items-center gap-2.5">
              <Meter
                value={offer.amount}
                max={offer.listingPrice}
                label={`${share}% of the asking price`}
                tone={fullAsk ? "verified" : "neutral"}
                className={cn("flex-1", past && "opacity-50")}
              />
              {/* "full asking price" beside the figure already says 100%. */}
              {fullAsk && share === 100 ? null : (
                <span className="shrink-0 text-xs text-subtle tabular-nums">
                  {share}% of asking
                </span>
              )}
            </div>
          ) : null}

          <Link
            href={`/listing/${offer.listingSlug}`}
            className={cn(
              "mt-2 block truncate text-sm font-medium underline-offset-4 transition-colors duration-150 hover:text-fg hover:underline",
              past ? "text-muted" : "text-fg",
            )}
          >
            {offer.listingTitle || offer.listingHandle}
          </Link>
          <p className="mt-0.5 truncate text-[0.8125rem] text-muted">
            {viewingAs === "seller"
              ? `From ${offer.buyerName}`
              : `Listed by ${offer.sellerName}`}
            {" · asking "}
            <span className="tabular-nums">{usd(offer.listingPrice)}</span>
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <Badge variant={status.variant} size="sm">
              {status.label}
            </Badge>
            {yourTurn ? (
              <TurnFlag mine />
            ) : offer.awaiting ? (
              <TurnFlag mine={false} who={theirName.split(/\s+/)[0]} />
            ) : null}
            {open ? (
              <span className="inline-flex items-center gap-1 text-xs text-subtle tabular-nums">
                <ClockIcon aria-hidden="true" className="size-3" />
                {timeLeft(offer.expiresAt)}
              </span>
            ) : null}
          </div>

          {offer.message ? (
            <p className="mt-3 max-w-[62ch] border-l-2 border-line pl-3 text-[0.8125rem] leading-relaxed break-words text-muted">
              {offer.message}
            </p>
          ) : null}

          {offer.effectiveStatus === "ACCEPTED" ? (
            viewingAs === "buyer" ? (
              <Callout
                tone="success"
                title="Accepted."
                className="mt-3"
                action={
                  <Button asChild size="sm">
                    <Link href={`/listing/${offer.listingSlug}`}>
                      Open the deal
                    </Link>
                  </Button>
                }
              >
                The listing is held for you at {usd(offer.amount)} while you
                open the deal — it lapses if you do not.
              </Callout>
            ) : (
              <Callout tone="success" title="Accepted." className="mt-3">
                The listing is reserved for this buyer while they open the deal.
                If they do not, it comes back on sale on its own.
              </Callout>
            )
          ) : null}
        </div>

        {hasActions || offer.conversationId ? (
          <div
            className={cn(
              "flex flex-col items-start gap-2",
              hasActions && "md:w-[19rem] md:shrink-0",
            )}
          >
            <div className="w-full empty:hidden">
              <OfferActions
                offer={offer}
                viewingAs={viewingAs}
                askingPrice={offer.listingPrice}
              />
            </div>
            {offer.conversationId ? (
              <Button asChild variant="ghost" size="sm">
                <Link href={threadHref(offer.conversationId, offer.listingId)}>
                  <MessagesSquareIcon aria-hidden="true" />
                  Open the chat
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
