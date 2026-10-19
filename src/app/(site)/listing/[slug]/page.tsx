import {
  BadgeCheckIcon,
  CalendarClockIcon,
  CircleDollarSignIcon,
  MapPinIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ListingCard } from "@/components/home/listing-card";
import { BuyPanel } from "@/components/listing/buy-panel";
import { ListingBuyBar } from "@/components/listing/listing-buy-bar";
import {
  MetricsPanel,
  MonetizationNotice,
  Panel,
  ProofPanel,
  SellerPanel,
  TransferPanel,
} from "@/components/listing/listing-sections";
import { OfferForm } from "@/components/listing/offer-form";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/page-header";
import { Container } from "@/components/ui/section";
import { platformMap } from "@/data/platforms";
import { databaseGate } from "@/lib/db-gate";
import { withResellerDiscount } from "@/lib/reseller";
import { formatCompact } from "@/lib/utils";
import {
  getListing,
  getProofCount,
  getSimilarListings,
} from "@/server/listings";
import { heldByAcceptedOffer } from "@/server/offers";
import { activeResellers } from "@/server/reseller-status";
import { getSeller } from "@/server/sellers";
import { getCurrentUser } from "@/server/session";
import { getSettings } from "@/server/settings";

// Listings change constantly, so these render on demand rather than being
// baked at build time.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/listing/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const listing = await getListing(slug);
  if (!listing) return { title: "Listing not found" };

  const platform = platformMap[listing.platform];
  const title = `${listing.handle} — ${formatCompact(listing.audience)} ${platform.metricLabel.toLowerCase()} ${platform.name} for sale`;

  return {
    title,
    description: listing.title,
    openGraph: {
      title,
      description: listing.title,
      images: [{ url: listing.coverUrl }],
    },
    alternates: { canonical: `/listing/${listing.slug}` },
  };
}

export default async function ListingPage({
  params,
}: PageProps<"/listing/[slug]">) {
  const gate = await databaseGate();
  if (gate) return gate;

  const { slug } = await params;
  const [listing, settings, viewer] = await Promise.all([
    getListing(slug),
    getSettings(),
    getCurrentUser(),
  ]);
  if (!listing) notFound();

  const platform = platformMap[listing.platform];
  const [seller, similar, proofCount] = await Promise.all([
    getSeller(listing.sellerSlug),
    getSimilarListings(listing),
    getProofCount(listing.id),
  ]);
  if (!seller) notFound();

  // The rates this viewer would be charged: a Reseller badge holder's are
  // already discounted, so the quote is what the deal will cost them. Only
  // the three rates reach the browser, not the rest of the settings.
  const viewerIsReseller = viewer
    ? (await activeResellers([viewer.id])).has(viewer.id)
    : false;
  const fees = withResellerDiscount(
    settings,
    { buyer: viewerIsReseller, seller: false },
    settings.resellerDiscountBp,
  );

  // A seller browsing their own listing gets neither buy action.
  const isOwnListing =
    Boolean(viewer?.slug) && viewer?.slug === listing.sellerSlug;

  // A reserved listing is held for one person. If it is this viewer, by an
  // offer the seller accepted, the deal opens here at the agreed price.
  const heldOffer =
    listing.reserved && viewer
      ? await heldByAcceptedOffer(listing.id, viewer.id)
      : null;
  const heldOfferUsd = heldOffer ? heldOffer.amountUsd / 100 : null;
  const PlatformIcon = platform.icon;

  return (
    <>
      <Container className="pt-8 pb-12 sm:pt-10 sm:pb-16">
        <Breadcrumbs
          className="mb-6"
          crumbs={[
            { label: "Home", href: "/" },
            { label: "Browse", href: "/browse" },
            { label: platform.name, href: `/browse/${platform.id}` },
            { label: listing.handle },
          ]}
        />

        <div className="lg:grid lg:grid-cols-[1fr_22rem] lg:items-start lg:gap-8">
          <div className="min-w-0">
            {/* Identity */}
            <div className="flex items-start gap-4">
              {/* biome-ignore lint/performance/noImgElement: static SVG avatar. */}
              <img
                src={listing.avatarUrl}
                alt=""
                width={128}
                height={128}
                className="size-16 shrink-0 rounded-xl bg-surface-2 ring-1 ring-line sm:size-[4.5rem]"
              />
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-[1.75rem] leading-[1.1] font-semibold tracking-[-0.03em] break-all sm:text-[2.25rem]">
                    {listing.handle}
                  </h1>
                  {listing.ownershipVerified ? (
                    <BadgeCheckIcon
                      aria-label="Ownership verified"
                      className="size-5 shrink-0 text-verified"
                    />
                  ) : null}
                </div>
                <p className="mt-1.5 flex items-center gap-2 text-sm text-muted">
                  <span
                    className="flex items-center gap-1.5"
                    style={{ color: platform.tint }}
                  >
                    <PlatformIcon className="size-4" />
                  </span>
                  {platform.name} · {listing.niche}
                </p>
              </div>
            </div>

            <p className="mt-5 text-base leading-relaxed text-fg sm:text-lg">
              {listing.title}
            </p>

            <ul className="mt-5 flex flex-wrap gap-2">
              <li>
                <Badge size="md">
                  <CircleDollarSignIcon aria-hidden="true" />
                  {listing.monetized ? "Monetized" : "Not monetized"}
                </Badge>
              </li>
              <li>
                <Badge size="md">
                  <MapPinIcon aria-hidden="true" />
                  {listing.country}
                </Badge>
              </li>
              <li>
                <Badge size="md">
                  <CalendarClockIcon aria-hidden="true" />
                  Listed{" "}
                  {listing.listedDaysAgo === 0
                    ? "today"
                    : `${listing.listedDaysAgo} day${listing.listedDaysAgo === 1 ? "" : "s"} ago`}
                </Badge>
              </li>
              {listing.ownershipVerified ? (
                <li>
                  <Badge variant="verified" size="md">
                    <BadgeCheckIcon aria-hidden="true" />
                    Ownership verified
                  </Badge>
                </li>
              ) : null}
            </ul>

            {/* Purchase panel sits here on mobile, in the rail on desktop. */}
            <div id="buy" className="mt-7 scroll-mt-20 lg:hidden">
              <BuyPanel
                listing={listing}
                holdDays={platform.holdDays}
                fees={fees}
                isOwnListing={isOwnListing}
                heldOfferUsd={heldOfferUsd}
              />
            </div>

            <div className="mt-7 flex flex-col gap-3 lg:mt-8">
              <MetricsPanel listing={listing} platform={platform} />
              <MonetizationNotice listing={listing} />
              <TransferPanel platform={platform} />
              <ProofPanel count={proofCount} />
              <SellerPanel seller={seller} />

              {listing.reserved ? null : (
                <Panel title="Make an offer" id="offer">
                  <p className="text-sm leading-relaxed text-muted">
                    Offer below the asking price and the seller can accept,
                    counter, or decline. Nothing is charged when an offer is
                    accepted — the listing is held for you while you pay.
                  </p>
                  <div className="mt-5">
                    <OfferForm
                      listingId={listing.id}
                      listingSlug={listing.slug}
                      askingPrice={listing.price}
                      expiryHours={settings.offerExpiryHours}
                      isOwnListing={
                        Boolean(viewer?.slug) &&
                        viewer?.slug === listing.sellerSlug
                      }
                    />
                  </div>
                </Panel>
              )}
            </div>
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <BuyPanel
                listing={listing}
                holdDays={platform.holdDays}
                fees={fees}
                isOwnListing={isOwnListing}
                heldOfferUsd={heldOfferUsd}
              />
            </div>
          </aside>
        </div>
      </Container>

      {/* Neither a seller on their own listing nor someone else's held one
          has a deal to start, so neither gets the bar. */}
      {isOwnListing || (listing.reserved && !heldOfferUsd) ? null : (
        <ListingBuyBar
          label={heldOfferUsd ? "Your accepted offer" : "Asking price"}
          price={heldOfferUsd ?? listing.price}
          wasPrice={heldOfferUsd ? undefined : listing.wasPrice}
          targetId="buy"
        />
      )}

      {similar.length ? (
        <section className="border-t border-line bg-bg-subtle">
          <Container className="py-12 sm:py-16">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 className="text-xl font-semibold tracking-[-0.02em] sm:text-2xl">
                Similar accounts for sale
              </h2>
              <Link
                href={`/browse/${platform.id}`}
                className="inline-flex min-h-11 items-center text-sm font-medium text-fg transition-colors duration-150 hover:text-muted"
              >
                All {platform.name} {platform.assetNoun}
              </Link>
            </div>
            <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {similar.map((item) => (
                <li key={item.id}>
                  <ListingCard listing={item} />
                </li>
              ))}
            </ul>
          </Container>
        </section>
      ) : null}
    </>
  );
}
