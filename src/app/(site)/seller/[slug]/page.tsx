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
import { ListingCard } from "@/components/home/listing-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Price } from "@/components/ui/price";
import { Container, Section } from "@/components/ui/section";
import { platformMap } from "@/data/platforms";
import { sellerAvatarSrc } from "@/data/sellers";
import { databaseGate } from "@/lib/db-gate";
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

  const description = `${seller.name} has completed ${seller.sales} escrow-settled sales on Channel Adda with a ${seller.rating.toFixed(1)} rating. Verified since ${seller.memberSince}.`;
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
                </h1>
                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                  <span className="flex items-center gap-1">
                    <StarIcon
                      aria-hidden="true"
                      className="size-4 fill-primary text-primary"
                    />
                    <span className="tnum font-semibold text-fg">
                      {seller.rating.toFixed(1)}
                    </span>
                  </span>
                  <span className="tnum">({seller.reviews} reviews)</span>
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

          <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            <Stat label="Completed sales" value={String(seller.sales)} />
            <Stat
              label="Settled volume"
              value={<Price usd={seller.volume} compact />}
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
              Every rating here comes from an escrow-settled order. A review can
              only be written by a buyer whose deal completed, so there is no
              way to buy reputation on Channel Adda.
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
      <dt className="text-[0.6875rem] tracking-wide text-subtle uppercase">
        {label}
      </dt>
      <dd className="tnum mt-1 flex items-center gap-1.5 text-base font-semibold">
        {icon}
        {value}
      </dd>
    </div>
  );
}
