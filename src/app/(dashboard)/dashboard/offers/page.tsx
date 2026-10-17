import { HandCoinsIcon, InboxIcon, TagIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ComponentType, ReactNode, SVGProps } from "react";
import {
  OfferCard,
  type OfferCardData,
} from "@/components/dashboard/offer-card";
import { PageHead, Rows, Section } from "@/components/dashboard/page-parts";
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

/**
 * An empty group, with somewhere to go from it.
 *
 * Local rather than the shared `EmptyState`, which owns the whole page and
 * carries an `h2`: these two sit *under* an `h2` apiece, so they need a
 * quieter box and a heading one level down.
 */
function GroupEmpty({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-panel border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
      <span className="flex size-11 items-center justify-center rounded-2xl bg-surface-2 text-subtle">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <h3 className="mt-3.5 font-display text-[0.9375rem] font-bold text-fg">
        {title}
      </h3>
      <p className="mx-auto mt-1.5 max-w-[46ch] text-sm leading-relaxed text-muted">
        {body}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

function Group({
  title,
  description,
  offers,
  viewingAs,
  empty,
}: {
  title: string;
  description: string;
  offers: OfferCardData[];
  viewingAs: "buyer" | "seller";
  empty: ReactNode;
}) {
  const waiting = offers.filter((o) => o.awaiting === viewingAs).length;

  return (
    <Section
      title={title}
      description={description}
      actions={
        waiting > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary-text">
            <span
              aria-hidden="true"
              className="size-1.5 animate-pulse-dot rounded-full bg-primary"
            />
            {waiting} waiting on you
          </span>
        ) : null
      }
    >
      {offers.length === 0 ? (
        empty
      ) : (
        <Rows>
          {offers.map((offer) => (
            <OfferCard key={offer.id} offer={offer} viewingAs={viewingAs} />
          ))}
        </Rows>
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
      <PageHead
        title="Offers"
        description={
          waiting > 0
            ? `${waiting} ${waiting === 1 ? "offer needs" : "offers need"} an answer from you. An accepted offer holds the listing for that buyer.`
            : "Everything you have offered and everything offered to you. An accepted offer holds the listing for that buyer."
        }
        actions={
          <Button asChild variant="secondary" size="md">
            <Link href="/browse">Browse accounts</Link>
          </Button>
        }
      />

      <Group
        title="Offers on your listings"
        description="What buyers have offered you. Accept, counter or decline."
        offers={received.map(toCard)}
        viewingAs="seller"
        empty={
          <GroupEmpty
            icon={InboxIcon}
            title="Nobody has made you an offer yet"
            body="Buyers can offer below your asking price on any listing of yours that is live. Offers land here, and you can counter without losing the buyer."
            action={
              <Button asChild variant="secondary" size="sm">
                <Link href="/dashboard/listings">See your listings</Link>
              </Button>
            }
          />
        }
      />

      <Group
        title="Offers you have made"
        description="What you have offered on other people's listings."
        offers={made.map(toCard)}
        viewingAs="buyer"
        empty={
          <GroupEmpty
            icon={TagIcon}
            title="You have not made any offers"
            body="Found an account you want for less than the asking price? Make an offer on its listing — the seller can accept it, counter it, or let it lapse."
            action={
              <Button asChild size="sm">
                <Link href="/browse">Find an account</Link>
              </Button>
            }
          />
        }
      />

      <p className="mt-8 flex items-start gap-2.5 rounded-panel border border-line bg-surface px-4 py-3.5 text-sm leading-relaxed text-muted">
        <HandCoinsIcon
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-subtle"
        />
        <span>
          An offer is not a payment. Accepting one reserves the listing for that
          buyer and hides it from everyone else; no money moves until a deal is
          opened and the handover begins.
        </span>
      </p>
    </>
  );
}
