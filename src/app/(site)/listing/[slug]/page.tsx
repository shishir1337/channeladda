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
import { Container } from "@/components/ui/section";
import { platformMap } from "@/data/platforms";
import { databaseGate } from "@/lib/db-gate";
import { formatCompact } from "@/lib/utils";
import { getListing, getSimilarListings } from "@/server/listings";
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
  const [seller, similar] = await Promise.all([
    getSeller(listing.sellerSlug),
    getSimilarListings(listing),
  ]);
  if (!seller) notFound();

  // A seller browsing their own listing gets neither buy action.
  const isOwnListing =
    Boolean(viewer?.slug) && viewer?.slug === listing.sellerSlug;
  const PlatformIcon = platform.icon;

  return (
    <>
      {/* Cover banner */}
      <div className="relative border-b border-line">
        {/* biome-ignore lint/performance/noImgElement: static SVG artwork. */}
        <img
          src={listing.coverUrl}
          alt=""
          width={480}
          height={210}
          className="h-40 w-full object-cover sm:h-56 lg:h-64"
        />
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-bg via-bg/55 to-transparent"
        />
      </div>

      <Container className="relative -mt-14 pb-12 sm:-mt-16 sm:pb-16">
        <nav aria-label="Breadcrumb" className="mb-5">
          <ol className="flex flex-wrap items-center gap-1.5 text-xs text-subtle">
            <li>
              <Link href="/" className="transition-colors hover:text-fg">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link href="/browse" className="transition-colors hover:text-fg">
                Browse
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link
                href={`/browse/${platform.id}`}
                className="transition-colors hover:text-fg"
              >
                {platform.name}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="text-muted">
              {listing.handle}
            </li>
          </ol>
        </nav>

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
                className="size-16 shrink-0 rounded-2xl border-[3px] border-bg bg-surface-2 sm:size-20"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-[1.5rem] leading-tight font-bold sm:text-3xl">
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
                <Badge
                  variant={listing.monetized ? "verified" : "neutral"}
                  size="md"
                >
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
            <div className="mt-7 lg:hidden">
              <BuyPanel
                listing={listing}
                holdDays={platform.holdDays}
                fees={settings}
                isOwnListing={isOwnListing}
              />
            </div>

            <div className="mt-7 flex flex-col gap-4 lg:mt-8">
              <MetricsPanel listing={listing} platform={platform} />
              <MonetizationNotice listing={listing} />
              <TransferPanel platform={platform} />
              <ProofPanel platform={platform} />
              <SellerPanel seller={seller} />

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
            </div>
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <BuyPanel
                listing={listing}
                holdDays={platform.holdDays}
                fees={settings}
                isOwnListing={isOwnListing}
              />
            </div>
          </aside>
        </div>
      </Container>

      {similar.length ? (
        <section className="border-t border-line bg-bg-subtle">
          <Container className="py-12 sm:py-16">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 className="font-display text-xl font-bold sm:text-2xl">
                Similar accounts for sale
              </h2>
              <Link
                href={`/browse/${platform.id}`}
                className="inline-flex min-h-11 items-center text-sm font-semibold text-primary-text transition-colors hover:text-fg"
              >
                All {platform.name} {platform.assetNoun}
              </Link>
            </div>
            <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
