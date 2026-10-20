"use client";

import { EyeIcon, MessageSquareIcon, ShieldCheckIcon } from "lucide-react";
import Link from "next/link";
import { FavoriteButton } from "@/components/home/favorite-button";
import { AskSeller } from "@/components/listing/ask-seller";
import { ReportListing } from "@/components/listing/report-listing";
import { StartDeal } from "@/components/listing/start-deal";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import type { Listing } from "@/data/listings";
import type { Platform } from "@/generated/prisma/enums";
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
    <div className="rounded-panel border border-line bg-surface p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.8125rem] text-subtle">Asking price</p>
          <div className="mt-0.5 flex items-baseline gap-2.5">
            <Price
              usd={listing.price}
              className="tnum text-3xl font-semibold tracking-[-0.02em] text-fg"
            />
            {listing.wasPrice ? (
              <Price
                usd={listing.wasPrice}
                className="text-sm text-subtle line-through"
              />
            ) : null}
          </div>
        </div>
        <FavoriteButton
          listingId={listing.id}
          handle={listing.handle}
          on="surface"
        />
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
          // The page's listing keys platforms in lower case; deals in upper.
          platform={listing.platform.toUpperCase() as Platform}
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

      <div className="mt-5 rounded-card border border-line bg-bg-subtle p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-fg">
          <ShieldCheckIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-verified"
          />
          Nobody can be left short
        </p>
        <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted">
          On a Fastest deal you pay Channel Adda, never the seller, and the
          seller is paid only once our agent holds the channel, after a{" "}
          <span className="font-medium text-fg">{holdDays}-day</span> holding
          period. On a Safest deal our agent holds the channel first, and you
          pay the seller directly only once it is in our hands.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <span className="inline-flex items-center gap-1.5 text-[0.8125rem] text-subtle">
          <EyeIcon aria-hidden="true" className="size-3.5" />
          <span className="tnum">{listing.watching}</span> watching
        </span>
        <ReportListing listingId={listing.id} listingSlug={listing.slug} />
      </div>
    </div>
  );
}
