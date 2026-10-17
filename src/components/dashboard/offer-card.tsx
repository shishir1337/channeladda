"use client";

import Link from "next/link";
import { OfferActions } from "@/components/offers/offer-actions";
import { Badge } from "@/components/ui/badge";
import type { OfferStatus } from "@/generated/prisma/enums";
import { timeLeft } from "@/lib/chat-time";

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

  return (
    <li className="bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={status.variant} size="sm">
              {status.label}
            </Badge>
            {yourTurn ? (
              <span className="text-xs font-medium text-primary-text">
                waiting on you
              </span>
            ) : offer.awaiting ? (
              <span className="text-xs text-subtle">
                waiting on {theirName.split(/\s+/)[0]}
              </span>
            ) : null}
            {offer.effectiveStatus === "OPEN" ? (
              <span className="text-xs text-subtle tabular-nums">
                {timeLeft(offer.expiresAt)}
              </span>
            ) : null}
          </div>

          <Link
            href={`/listing/${offer.listingSlug}`}
            className="mt-1.5 block truncate font-medium text-fg underline-offset-4 hover:underline"
          >
            {offer.listingTitle || offer.listingHandle}
          </Link>
          <p className="truncate text-sm text-subtle">
            {viewingAs === "seller"
              ? `From ${offer.buyerName}`
              : `Listed by ${offer.sellerName}`}
            {" · asking "}
            {usd(offer.listingPrice)}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="font-display text-xl font-bold text-fg tabular-nums">
            {usd(offer.amount)}
          </p>
          <p
            className={
              atAskingPrice && !offer.bySeller
                ? "text-xs font-medium text-verified"
                : "text-xs text-subtle"
            }
          >
            {offer.bySeller
              ? "their counter"
              : atAskingPrice
                ? "full asking price"
                : "offered"}
          </p>
        </div>
      </div>

      {offer.message ? (
        <p className="mt-3 rounded-xl border border-line bg-surface-2 p-3 text-sm leading-relaxed text-muted">
          {offer.message}
        </p>
      ) : null}

      <div className="mt-4 empty:hidden">
        <OfferActions offer={offer} viewingAs={viewingAs} />
      </div>

      {offer.effectiveStatus === "ACCEPTED" ? (
        <p className="mt-4 rounded-xl border border-verified/30 bg-verified-soft p-3 text-sm text-fg">
          {viewingAs === "buyer" ? (
            <>
              Accepted. The listing is held for you at {usd(offer.amount)} while
              you open the deal — it lapses if you do not.{" "}
              <Link
                href={`/listing/${offer.listingSlug}`}
                className="font-semibold text-primary-text underline underline-offset-2"
              >
                Open the deal
              </Link>
            </>
          ) : (
            "Accepted. The listing is reserved for this buyer while they open the deal. If they do not, it comes back on sale on its own."
          )}
        </p>
      ) : null}
    </li>
  );
}
