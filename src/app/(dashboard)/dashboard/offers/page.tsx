import { HandCoinsIcon, TagIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  EmptyState,
  FilterBar,
  FilterLink,
  List,
  PageHeader,
} from "@/components/app/kit";
import {
  OfferCard,
  type OfferCardData,
} from "@/components/dashboard/offer-card";
import { Button } from "@/components/ui/button";
import { iconText } from "@/components/ui/icon-hue";
import {
  OFFER_TABS,
  type OfferTab,
  offerTabs,
  openOfferTab,
} from "@/lib/offer-tabs";
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
    listingId: offer.listingId,
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
    counterOf: offer.counterOf,
    conversationId: offer.conversationId,
  };
}

const TAB_LABEL: Record<OfferTab, string> = {
  yours: "Your turn",
  waiting: "Waiting",
  closed: "Closed",
};

const TAB_EMPTY: Record<OfferTab, string> = {
  yours: "No offer needs an answer from you.",
  waiting: "No offers are waiting on anyone else.",
  closed: "No offers have closed yet.",
};

export default async function OffersPage({
  searchParams,
}: PageProps<"/dashboard/offers">) {
  const user = await requireUser("/dashboard/offers");
  const [received, made, params] = await Promise.all([
    getOffersForSeller(user.id),
    getOffersForBuyer(user.id),
    searchParams,
  ]);

  // Both sides in one list, each offer knowing which side the reader is on.
  const all = [
    ...received.map((offer) => ({ ...offer, viewingAs: "seller" as const })),
    ...made.map((offer) => ({ ...offer, viewingAs: "buyer" as const })),
  ];
  const tabs = offerTabs(all);
  const counts = {
    yours: tabs.yours.length,
    waiting: tabs.waiting.length,
    closed: tabs.closed.length,
  };
  const asked = typeof params.tab === "string" ? params.tab : undefined;
  const tab = openOfferTab(asked, counts);
  const waiting = counts.yours;

  return (
    <>
      <PageHeader
        title="Offers"
        description={
          waiting > 0
            ? `${waiting} ${waiting === 1 ? "offer needs" : "offers need"} an answer from you.`
            : undefined
        }
        actions={
          <Button asChild variant="secondary" size="md">
            <Link href="/browse">Browse accounts</Link>
          </Button>
        }
      />

      {all.length === 0 ? (
        <EmptyState
          icon={TagIcon}
          title="No offers yet"
          info="Make an offer on any listing for less than its asking price, and buyers can do the same on yours. The other side can accept, counter or let it lapse."
          action={
            <>
              <Button asChild size="sm">
                <Link href="/browse">Find an account</Link>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <Link href="/dashboard/listings">See your listings</Link>
              </Button>
            </>
          }
        />
      ) : (
        <>
          <FilterBar label="Offers by whose move it is" className="mb-5">
            {OFFER_TABS.map((name) => (
              <FilterLink
                key={name}
                href={`/dashboard/offers?tab=${name}`}
                active={tab === name}
                count={counts[name]}
                tone={name === "yours" ? "primary" : "neutral"}
              >
                {TAB_LABEL[name]}
              </FilterLink>
            ))}
          </FilterBar>

          {tabs[tab].length > 0 ? (
            <List>
              {tabs[tab].map((offer) => (
                <OfferCard
                  key={offer.id}
                  offer={toCard(offer)}
                  viewingAs={offer.viewingAs}
                />
              ))}
            </List>
          ) : (
            <p className="rounded-card border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
              {TAB_EMPTY[tab]}
            </p>
          )}
        </>
      )}

      {/* Money copy, so it stays on the page word for word — as one quiet
          line under the lists rather than a box competing with them. */}
      <p className="mt-10 flex max-w-[100ch] items-start gap-2.5 text-[0.8125rem] leading-relaxed text-muted">
        <HandCoinsIcon
          aria-hidden="true"
          className={`mt-0.5 size-4 shrink-0 ${iconText(HandCoinsIcon)}`}
        />
        <span className="min-w-0">
          <span className="font-medium text-fg">
            An offer is not a payment.
          </span>{" "}
          Accepting one reserves the listing for that buyer and hides it from
          everyone else; no money moves until a deal is opened and the handover
          begins.
        </span>
      </p>
    </>
  );
}
