import {
  BadgeCheckIcon,
  MessageSquareIcon,
  ShieldCheckIcon,
  StarIcon,
  TimerIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { pointsLabel, ResellerBadge } from "@/components/app/reseller-badge";
import { ListingCard } from "@/components/home/listing-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Price } from "@/components/ui/price";
import { Container, Section } from "@/components/ui/section";
import { platformMap } from "@/data/platforms";
import { sellerAvatarSrc } from "@/data/sellers";
import { databaseGate } from "@/lib/db-gate";
import { emptyRecord } from "@/lib/track-record";
import { ratingLabel } from "@/lib/utils";
import { getSellerListings } from "@/server/listings";
import { getSeller, getSellerSlugs } from "@/server/sellers";

/** Marketplace data changes constantly; Prisma queries are invisible to Next's
 *  cache detection, so revalidation is declared explicitly. */
export const revalidate = 60;

export async function generateStaticParams() {
  return (await getSellerSlugs()).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/seller/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const seller = await getSeller(slug);
  if (!seller) return { title: "Seller not found" };

  const description = `${seller.name} has completed ${seller.sales} supervised sales on Channel Adda${seller.rating === null ? "" : ` with a ${seller.rating.toFixed(1)} rating`}. Verified since ${seller.memberSince}.`;
  return {
    title: `${seller.name} — verified seller`,
    description,
    openGraph: { title: `${seller.name} on Channel Adda`, description },
    alternates: { canonical: `/seller/${seller.slug}` },
  };
}

export default async function SellerPage({
  params,
}: PageProps<"/seller/[slug]">) {
  const gate = await databaseGate();
  if (gate) return gate;

  const { slug } = await params;
  const seller = await getSeller(slug);
  if (!seller) notFound();

  const active = await getSellerListings(seller.slug);
  const record = seller.record ?? emptyRecord();

  return (
    <>
      <div className="border-b border-line bg-bg-subtle">
        <Container className="py-8 sm:py-12">
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol className="flex flex-wrap items-center gap-1.5 text-xs text-subtle">
              <li>
                <Link href="/" className="transition-colors hover:text-fg">
                  Home
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <Link
                  href="/sellers"
                  className="transition-colors hover:text-fg"
                >
                  Sellers
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="text-muted">
                {seller.name}
              </li>
            </ol>
          </nav>

          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-4 sm:gap-5">
              {/* biome-ignore lint/performance/noImgElement: static SVG avatar. */}
              <img
                src={sellerAvatarSrc(seller.slug)}
                alt=""
                width={160}
                height={160}
                className="size-20 shrink-0 rounded-full border-2 border-line sm:size-24"
              />
              <div className="min-w-0">
                <h1 className="flex flex-wrap items-center gap-2 font-display text-[1.6rem] leading-tight font-bold sm:text-4xl">
                  {seller.name}
                  <BadgeCheckIcon
                    aria-label="Verified seller"
                    className="size-6 shrink-0 text-verified"
                  />
                  {seller.reseller ? <ResellerBadge /> : null}
                </h1>
                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                  <span className="flex items-center gap-1">
                    <StarIcon
                      aria-hidden="true"
                      className="size-4 fill-primary text-primary"
                    />
                    <span className="tnum font-semibold text-fg">
                      {ratingLabel(seller.rating)}
                    </span>
                  </span>
                  <span className="tnum">({seller.reviews} reviews)</span>
                  <span aria-hidden="true">·</span>
                  <span className="tnum font-medium text-fg">
                    {pointsLabel(seller.points ?? 0)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{seller.country}</span>
                  <span aria-hidden="true">·</span>
                  <span>Member since {seller.memberSince}</span>
                </p>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {seller.specialties.map((id) => {
                    const platform = platformMap[id];
                    return (
                      <li key={id}>
                        <Badge>
                          <platform.icon style={{ color: platform.tint }} />
                          {platform.name}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>

            <Button asChild variant="secondary" size="md" className="shrink-0">
              <Link href="/signup">
                <MessageSquareIcon aria-hidden="true" className="size-4" />
                Message seller
              </Link>
            </Button>
          </div>

          {/* Every completed deal, bought or sold, so a buyer sees the whole
              of someone's record here before deciding to deal with them. */}
          <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
            <Stat label="Deals done" value={String(record.deals)} />
            <Stat
              label="Deal worth"
              value={<Price usd={record.worthCents / 100} compact />}
            />
            <Stat
              label="Safest deals"
              value={
                <>
                  {record.safest.deals}
                  <span className="text-sm font-normal text-subtle">
                    <Price usd={record.safest.worthCents / 100} compact />
                  </span>
                </>
              }
            />
            <Stat
              label="Fastest deals"
              value={
                <>
                  {record.fastest.deals}
                  <span className="text-sm font-normal text-subtle">
                    <Price usd={record.fastest.worthCents / 100} compact />
                  </span>
                </>
              }
            />
            <Stat
              label="Replies in"
              value={`~${seller.responseMins} min`}
              icon={<TimerIcon aria-hidden="true" className="size-4" />}
            />
            <Stat label="Live listings" value={String(active.length)} />
          </dl>

          <p className="mt-6 flex items-start gap-2.5 rounded-card border border-verified/25 bg-verified-soft p-4 text-xs leading-relaxed text-muted">
            <ShieldCheckIcon
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-verified"
            />
            <span>
              Every review here comes from a deal that completed, so a review
              cannot be bought. Rating points are half the worth of completed
              deals, bought or sold; a Reseller badge holder&apos;s count three
              times while their badge lasts.
            </span>
          </p>
        </Container>
      </div>

      <Section>
        <Container>
          <h2 className="font-display text-xl font-bold sm:text-2xl">
            {active.length
              ? `${active.length} live ${active.length === 1 ? "listing" : "listings"}`
              : "Live listings"}
          </h2>

          {active.length ? (
            <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {active.map((listing, i) => (
                <li key={listing.id}>
                  <ListingCard listing={listing} priority={i < 3} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              className="mt-6"
              title="No live listings right now"
              description={`${seller.name} has sold ${seller.sales} accounts but has nothing on the market at the moment.`}
              action={
                <Button asChild size="md">
                  <Link href="/browse">Browse other sellers</Link>
                </Button>
              }
            />
          )}
        </Container>
      </Section>
    </>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-line bg-surface px-4 py-3.5">
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="tnum mt-1 flex items-baseline gap-1.5 text-base font-semibold">
        {icon}
        {value}
      </dd>
    </div>
  );
}
