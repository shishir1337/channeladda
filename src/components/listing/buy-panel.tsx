"use client";

import {
  EyeIcon,
  MessageSquareIcon,
  ShieldCheckIcon,
  TimerIcon,
  ZapIcon,
} from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import { FavoriteButton } from "@/components/home/favorite-button";
import { AskSeller } from "@/components/listing/ask-seller";
import { BuyAtAsking } from "@/components/listing/buy-at-asking";
import { ReportListing } from "@/components/listing/report-listing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import type { Listing } from "@/data/listings";
import { buyerTotal, type FeeSettings, formatRate } from "@/lib/fees";

/**
 * Sticky purchase panel. The fee is shown before the buyer commits to
 * anything — no total should ever appear for the first time at checkout.
 */
export function BuyPanel({
  listing,
  holdDays,
  fees,
  isOwnListing,
}: {
  listing: Listing;
  /** Only the primitive is passed — a Platform carries its icon component,
   *  and functions cannot cross into a Client Component. */
  holdDays: number;
  /** Set by an admin, so it is read on the server and handed down. */
  fees: FeeSettings;
  /** A seller cannot buy their own listing, so they get neither action. */
  isOwnListing: boolean;
}) {
  const _checkoutNoteId = useId();
  const { fee, total } = buyerTotal(listing.price, fees);
  // Escrow is mandatory above the cap and on platforms an owner can recover.
  const escrowOnly = listing.price >= fees.escrowRequiredAbove || holdDays > 7;

  return (
    <div className="rounded-panel border border-line bg-surface p-5 shadow-soft sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-subtle">Asking price</p>
          <div className="mt-1 flex items-baseline gap-2.5">
            <Price
              usd={listing.price}
              className="text-3xl font-semibold text-fg"
            />
            {listing.wasPrice ? (
              <Price
                usd={listing.wasPrice}
                className="text-sm text-subtle line-through"
              />
            ) : null}
          </div>
        </div>
        <FavoriteButton listingId={listing.id} handle={listing.handle} />
      </div>

      <dl className="mt-5 space-y-2.5 border-y border-line py-4 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted">Listing price</dt>
          <dd>
            <Price usd={listing.price} />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted">
            Buyer fee{" "}
            <span className="tnum text-subtle">
              ({formatRate(fees.buyerFeeBp)}%)
            </span>
          </dt>
          <dd>
            <Price usd={fee} />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 pt-1.5 font-semibold">
          <dt>You pay</dt>
          <dd>
            <Price usd={total} className="text-base" />
          </dd>
        </div>
      </dl>

      {/*
        Two ways to buy, and neither is mandatory.

        Someone happy with the price should never have to haggle for it, so
        taking the asking price is the primary action. Checkout does not exist
        yet, so today that sends a full-price offer the seller confirms; when
        checkout lands this button goes to payment and nothing else here
        changes.
      */}
      <div className="mt-5 grid gap-2.5">
        <BuyAtAsking
          listingId={listing.id}
          listingSlug={listing.slug}
          price={listing.price}
          isOwnListing={isOwnListing}
        />
        {!isOwnListing ? (
          <Button asChild variant="secondary" size="md">
            <Link href={`/listing/${listing.slug}#offer`}>
              <MessageSquareIcon aria-hidden="true" className="size-4" />
              Offer a different price
            </Link>
          </Button>
        ) : null}
        {!isOwnListing ? (
          <AskSeller listingId={listing.id} listingSlug={listing.slug} />
        ) : null}
        <p className="text-center text-xs leading-relaxed text-subtle">
          Paying online is not open yet. Either way the seller confirms first,
          and the listing is then held for you.
        </p>
      </div>

      <div className="mt-5 rounded-card border border-verified/25 bg-verified-soft p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-verified">
          <ShieldCheckIcon aria-hidden="true" className="size-4 shrink-0" />
          Escrow protected
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Your payment is held by Channel Adda and released{" "}
          <span className="font-medium text-fg">{holdDays} days</span> after you
          confirm the handover. If the transfer fails you are refunded in full.
        </p>
      </div>

      {escrowOnly ? (
        <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-subtle">
          <TimerIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Escrow is required on this listing. Quick checkout is only available
            on Telegram and Facebook under{" "}
            <Price usd={fees.escrowRequiredAbove} />.
          </span>
        </p>
      ) : (
        <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-subtle">
          <ZapIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Quick checkout is available on this listing — credentials released
            as soon as payment clears.
          </span>
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <Badge className="text-subtle">
          <EyeIcon aria-hidden="true" />
          <span className="tnum">{listing.watching}</span> watching
        </Badge>
        <ReportListing listingId={listing.id} listingSlug={listing.slug} />
      </div>
    </div>
  );
}
