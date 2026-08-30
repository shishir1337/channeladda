import type { Metadata } from "next";
import Link from "next/link";
import {
  OfferCard,
  type OfferCardData,
} from "@/components/dashboard/offer-card";
import type { OfferView } from "@/server/offers";
import { getOffersForBuyer, getOffersForSeller } from "@/server/offers";
import { requireUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Offers",
  robots: { index: false, follow: false },
};

/** Dates cannot cross into a Client Component; send strings. */
function toCard(offer: OfferView): OfferCardData {
  return {
    id: offer.id,
    listingSlug: offer.listingSlug,
    listingTitle: offer.listingTitle,
    listingHandle: offer.listingHandle,
    listingPrice: offer.listingPrice,
    amount: offer.amount,
    effectiveStatus: offer.effectiveStatus,
    bySeller: offer.bySeller,
    message: offer.message,
    expiresAt: offer.expiresAt.toISOString(),
    createdAt: offer.createdAt.toISOString(),
    buyerName: offer.buyerName,
    sellerName: offer.sellerName,
    awaiting: offer.awaiting,
  };
}

function Group({
  title,
  empty,
  offers,
  viewingAs,
}: {
  title: string;
  empty: string;
  offers: OfferCardData[];
  viewingAs: "buyer" | "seller";
}) {
  const waiting = offers.filter((o) => o.awaiting === viewingAs).length;

  return (
    <section className="mt-10 first:mt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-bold text-fg">{title}</h2>
        {waiting > 0 ? (
          <span className="text-sm font-medium text-primary-text">
            {waiting} waiting on you
          </span>
        ) : null}
      </div>

      {offers.length === 0 ? (
        <p className="mt-3 rounded-panel border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
          {empty}
        </p>
      ) : (
        <ul className="mt-3 grid gap-px overflow-hidden rounded-panel border border-line bg-line">
          {offers.map((offer) => (
            <OfferCard key={offer.id} offer={offer} viewingAs={viewingAs} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function OffersPage() {
  const user = await requireUser("/dashboard/offers");
  const [received, made] = await Promise.all([
    getOffersForSeller(user.id),
    getOffersForBuyer(user.id),
  ]);

  return (
    <>
      <p className="text-xs font-semibold tracking-[0.14em] text-subtle uppercase">
        Negotiations
      </p>
      <h1 className="mt-2 font-display text-3xl font-black tracking-tight text-fg sm:text-4xl">
        Offers
      </h1>
      <p className="mt-2 text-muted">
        Everything you have offered and everything offered to you.
      </p>

      <Group
        title="Offers on your listings"
        empty="Nobody has made you an offer yet."
        offers={received.map(toCard)}
        viewingAs="seller"
      />

      <Group
        title="Offers you have made"
        empty="You have not made any offers."
        offers={made.map(toCard)}
        viewingAs="buyer"
      />

      <p className="mt-10 text-sm text-subtle">
        Looking for something to buy?{" "}
        <Link
          href="/browse"
          className="font-medium text-primary-text underline-offset-4 hover:underline"
        >
          Browse accounts
        </Link>
        .
      </p>
    </>
  );
}
