import { HandCoinsIcon, InboxIcon, TagIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  Callout,
  Dot,
  EmptyState,
  List,
  PageHeader,
  Section,
} from "@/components/app/kit";
import {
  OfferCard,
  type OfferCardData,
} from "@/components/dashboard/offer-card";
import { Button } from "@/components/ui/button";
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
    counterOf: offer.counterOf,
    conversationId: offer.conversationId,
  };
}

function Group({
  id,
  title,
  description,
  offers,
  viewingAs,
  empty,
}: {
  id: string;
  title: string;
  description: string;
  offers: OfferCardData[];
  viewingAs: "buyer" | "seller";
  empty: ReactNode;
}) {
  const waiting = offers.filter((o) => o.awaiting === viewingAs).length;

  return (
    <Section
      id={id}
      title={title}
      description={description}
      count={offers.length > 0 ? offers.length : undefined}
      actions={
        // Gold only for what is waiting on the reader, and said in words.
        waiting > 0 ? (
          <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-primary-soft px-2.5 text-xs font-medium whitespace-nowrap text-primary-text tabular-nums ring-1 ring-primary/25 ring-inset">
            <Dot tone="primary" pulse />
            {waiting} waiting on you
          </span>
        ) : null
      }
    >
      {offers.length === 0 ? (
        empty
      ) : (
        <List>
          {offers.map((offer) => (
            <OfferCard key={offer.id} offer={offer} viewingAs={viewingAs} />
          ))}
        </List>
      )}
    </Section>
  );
}

export default async function OffersPage() {
  const user = await requireUser("/dashboard/offers");
  const [received, made] = await Promise.all([
    getOffersForSeller(user.id),
    getOffersForBuyer(user.id),
  ]);

  const waiting = [
    ...received.filter((offer) => offer.awaiting === "seller"),
    ...made.filter((offer) => offer.awaiting === "buyer"),
  ].length;

  return (
    <>
      <PageHeader
        title="Offers"
        description={
          waiting > 0
            ? `${waiting} ${waiting === 1 ? "offer needs" : "offers need"} an answer from you.`
            : "Everything you have offered, and everything offered to you."
        }
        actions={
          <Button asChild variant="secondary" size="md">
            <Link href="/browse">Browse accounts</Link>
          </Button>
        }
      />

      <Group
        id="received"
        title="Offers on your listings"
        description="What buyers have offered you. Accept, counter or decline."
        offers={received.map(toCard)}
        viewingAs="seller"
        empty={
          <EmptyState
            as="h3"
            icon={InboxIcon}
            title="Nobody has made you an offer yet"
            body="Buyers can offer below your asking price on any live listing of yours, and you can counter without losing the buyer."
            action={
              <Button asChild variant="secondary" size="sm">
                <Link href="/dashboard/listings">See your listings</Link>
              </Button>
            }
            className="py-10"
          />
        }
      />

      <Group
        id="made"
        title="Offers you have made"
        description="What you have offered on other people's listings."
        offers={made.map(toCard)}
        viewingAs="buyer"
        empty={
          <EmptyState
            as="h3"
            icon={TagIcon}
            title="You have not made any offers"
            body="Make an offer on any listing for less than its asking price — the seller can accept it, counter it, or let it lapse."
            action={
              <Button asChild size="sm">
                <Link href="/browse">Find an account</Link>
              </Button>
            }
            className="py-10"
          />
        }
      />

      <Callout
        tone="neutral"
        icon={HandCoinsIcon}
        title="An offer is not a payment."
        className="mt-8"
      >
        Accepting one reserves the listing for that buyer and hides it from
        everyone else; no money moves until a deal is opened and the handover
        begins.
      </Callout>
    </>
  );
}
