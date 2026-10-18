"use client";

import { ClockIcon, MessagesSquareIcon } from "lucide-react";
import Link from "next/link";
import { Callout, TurnFlag } from "@/components/app/kit";
import { OfferActions } from "@/components/offers/offer-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OfferStatus } from "@/generated/prisma/enums";
import { timeLeft } from "@/lib/chat-time";
import { cn } from "@/lib/utils";

export type OfferCardData = {
  id: string;
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

const STATUS: Record<
  OfferStatus,
  {
    label: string;
    variant: "neutral" | "verified" | "primary" | "danger" | "info";
  }
> = {
  OPEN: { label: "Open", variant: "primary" },
  ACCEPTED: { label: "Accepted", variant: "verified" },
  REJECTED: { label: "Declined", variant: "neutral" },
  COUNTERED: { label: "Countered", variant: "info" },
  EXPIRED: { label: "Expired", variant: "neutral" },
  WITHDRAWN: { label: "Withdrawn", variant: "neutral" },
};

function usd(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
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

  return (
    <li className="px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span
              className={cn(
                "text-lg leading-7 font-semibold tracking-[-0.01em] tabular-nums",
                past ? "text-muted" : "text-fg",
              )}
            >
              {usd(offer.amount)}
            </span>
            <span
              className={
                atAskingPrice && !offer.bySeller
                  ? "text-xs font-medium text-verified"
                  : "text-xs text-subtle"
              }
            >
              {offer.bySeller
                ? offer.counterOf
                  ? "their counter"
                  : "their price"
                : atAskingPrice
                  ? "full asking price"
                  : "offered"}
            </span>
          </div>

          <Link
            href={`/listing/${offer.listingSlug}`}
            className={cn(
              "mt-0.5 block truncate text-sm font-medium underline-offset-4 transition-colors duration-150 hover:text-fg hover:underline",
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
              <OfferActions offer={offer} viewingAs={viewingAs} />
            </div>
            {offer.conversationId ? (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/dashboard/messages/${offer.conversationId}`}>
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
