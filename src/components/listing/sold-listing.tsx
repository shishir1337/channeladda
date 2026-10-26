import {
  BadgeCheckIcon,
  CircleCheckBigIcon,
  CircleDollarSignIcon,
  MapPinIcon,
} from "lucide-react";
import Link from "next/link";
import { ListingCard } from "@/components/home/listing-card";
import {
  AboutPanel,
  MetricsPanel,
  SellerPanel,
} from "@/components/listing/listing-sections";
import { JsonLd } from "@/components/site/json-ld";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/ui/page-header";
import { Container } from "@/components/ui/section";
import type { Listing } from "@/data/listings";
import type { Platform } from "@/data/platforms";
import type { Seller } from "@/data/sellers";
import { artworkProps } from "@/lib/artwork";
import { listingLd } from "@/lib/listing-seo";
import { siteUrl } from "@/lib/site-url";
import { longDate } from "@/lib/time";

/**
 * "24 October 2026", in India time like every date on the public pages: they
 * are revalidated for everyone, so they cannot be drawn in one reader's zone.
 */
const longDay = (date: Date) => longDate(date);

/**
 * A listing whose deal has completed, at its old address.
 *
 * Saved links, links in chats and the seller's page all pointed at a 404
 * the moment a listing sold. Now they open this: what the account was, the
 * seller's own description, who sold it and when — and nothing to buy or
 * offer on, with the way to similar accounts right under the banner.
 */
export function SoldListing({
  listing,
  platform,
  soldAt,
  seller,
  similar,
  description,
}: {
  listing: Listing;
  platform: Platform;
  soldAt: Date;
  seller: Seller | null;
  similar: Listing[];
  description: string | null;
}) {
  const PlatformIcon = platform.icon;
  return (
    <>
      <JsonLd data={listingLd(siteUrl(), listing, platform, { sold: true })} />
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

        <div className="max-w-3xl">
          <div className="flex flex-wrap items-start gap-4">
            {/* biome-ignore lint/performance/noImgElement: as on the live listing, sized by `artworkProps`. */}
            <img
              {...artworkProps({
                src: listing.avatarUrl,
                width: 72,
                height: 72,
                eager: true,
              })}
              alt=""
              className="size-16 shrink-0 rounded-xl bg-surface-2 object-cover ring-1 ring-line sm:size-[4.5rem]"
            />
            <div className="min-w-0 flex-1 pt-0.5">
              <h1 className="text-[1.75rem] leading-[1.1] font-semibold tracking-[-0.03em] break-all sm:text-[2.25rem]">
                {listing.handle}
              </h1>
              <p className="mt-1.5 flex items-center gap-2 text-sm text-muted">
                <PlatformIcon
                  aria-hidden="true"
                  className="size-4"
                  style={{ color: platform.tint }}
                />
                {platform.name} · {listing.niche}
              </p>
            </div>
          </div>

          {/* The first thing read: this account is not for sale any more. */}
          <div
            role="status"
            className="mt-6 flex flex-col gap-4 rounded-card border border-verified/30 bg-verified-soft p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
          >
            <div className="flex items-start gap-3">
              <CircleCheckBigIcon
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-verified"
              />
              <div className="min-w-0">
                <p className="text-[0.9375rem] font-semibold text-fg">
                  Sold on{" "}
                  <time dateTime={soldAt.toISOString()}>{longDay(soldAt)}</time>
                </p>
                <p className="mt-0.5 text-sm leading-relaxed text-muted">
                  This {platform.noun} changed hands through Channel Adda and is
                  no longer for sale.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:shrink-0">
              <Button asChild size="md">
                <Link href={`/browse/${platform.id}`}>
                  Browse {platform.label}
                </Link>
              </Button>
              {similar.length ? (
                <Button asChild size="md" variant="secondary">
                  <Link href="#similar">Similar accounts</Link>
                </Button>
              ) : null}
            </div>
          </div>

          <p className="mt-6 text-base leading-relaxed text-fg sm:text-lg">
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
            {listing.ownershipVerified ? (
              <li>
                <Badge variant="verified" size="md">
                  <BadgeCheckIcon aria-hidden="true" />
                  Ownership verified
                </Badge>
              </li>
            ) : null}
          </ul>

          <div className="mt-7 flex flex-col gap-3">
            <MetricsPanel listing={listing} platform={platform} />
            <AboutPanel text={description} />
            {seller ? <SellerPanel seller={seller} /> : null}
          </div>
        </div>
      </Container>

      {similar.length ? (
        <section
          id="similar"
          className="scroll-mt-20 border-t border-line bg-bg-subtle"
        >
          <Container className="py-12 sm:py-16">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 className="text-xl font-semibold tracking-[-0.02em] sm:text-2xl">
                Similar accounts for sale
              </h2>
              <Link
                href="/browse"
                className="inline-flex min-h-11 items-center text-sm font-medium text-fg transition-colors duration-150 hover:text-muted"
              >
                Browse every account
              </Link>
            </div>
            <ul className="no-scrollbar -mx-4 mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-3">
              {similar.map((item) => (
                <li
                  key={item.id}
                  className="w-[82%] shrink-0 snap-start sm:w-auto"
                >
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
