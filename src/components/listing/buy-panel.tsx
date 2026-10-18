"use client";

import { EyeIcon, MessageSquareIcon, ShieldCheckIcon } from "lucide-react";
import Link from "next/link";
import { FavoriteButton } from "@/components/home/favorite-button";
import { AskSeller } from "@/components/listing/ask-seller";
import { ReportListing } from "@/components/listing/report-listing";
import { StartDeal } from "@/components/listing/start-deal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import type { Listing } from "@/data/listings";
import type { FeeSettings } from "@/lib/fees";

/**
 * Sticky purchase panel. The fee is shown before the buyer commits to
 * anything — no total should ever appear for the first time at checkout.
 */
export function BuyPanel({
  listing,
  holdDays,
  fees,
  isOwnListing,
  heldOfferUsd = null,
}: {
  listing: Listing;
  /** Only the primitive is passed — a Platform carries its icon component,
   *  and functions cannot cross into a Client Component. */
  holdDays: number;
  /** Set by an admin, so it is read on the server and handed down. */
  fees: FeeSettings;
  /** A seller cannot buy their own listing, so they get neither action. */
  isOwnListing: boolean;
  /**
   * Dollars. Set when this viewer holds an accepted offer on a reserved
   * listing: the deal opens at this price, not the asking price.
   */
  heldOfferUsd?: number | null;
}) {
  // Reserved for somebody else: the buy and offer controls used to render
  // here anyway, and both were refused server-side with nothing on the
  // page saying the listing was held.
  const heldForSomeoneElse = listing.reserved === true && !heldOfferUsd;
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

      {heldOfferUsd ? (
        <p className="mt-4 rounded-card border border-verified/30 bg-verified-soft p-3.5 text-sm leading-relaxed text-fg">
          The seller accepted your offer of{" "}
          <Price usd={heldOfferUsd} className="font-semibold" />. The deal below
          opens at that price, and the listing is held for you while you start
          it — not for ever.
        </p>
      ) : null}

      {heldForSomeoneElse ? (
        <p className="mt-4 rounded-card border border-line bg-surface-2 p-3.5 text-sm leading-relaxed text-muted">
          <span className="font-semibold text-fg">Reserved.</span> Somebody is
          completing a purchase of this account. If it falls through it comes
          back on sale — save it to hear when.
        </p>
      ) : (
        <StartDeal
          listingId={listing.id}
          listingSlug={listing.slug}
          price={heldOfferUsd ?? listing.price}
          fees={fees}
          isOwnListing={isOwnListing}
        />
      )}

      <div className="mt-5 grid gap-2.5">
        {!isOwnListing && !listing.reserved ? (
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
      </div>

      <div className="mt-5 rounded-card border border-verified/25 bg-verified-soft p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-verified">
          <ShieldCheckIcon aria-hidden="true" className="size-4 shrink-0" />
          Nobody can be left short
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Whichever way you buy, you pay Channel Adda, never the seller, and we
          hold the money until the channel is yours. On a Fastest deal the
          seller is paid{" "}
          <span className="font-medium text-fg">{holdDays} days</span> after you
          confirm, which covers the window in which an old owner could try to
          recover the account. On a Safest deal our agent holds the channel
          itself as well, and you pay the price only once it is in our hands.
        </p>
      </div>

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
