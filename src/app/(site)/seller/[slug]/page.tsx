import {
  BadgeCheckIcon,
  MessageSquareIcon,
  ShieldCheckIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { pointsLabel, ResellerBadge } from "@/components/app/reseller-badge";
import { ListingCard } from "@/components/home/listing-card";
import { SellerAvatar } from "@/components/site/seller-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Breadcrumbs } from "@/components/ui/page-header";
import { Price } from "@/components/ui/price";
import { Container, Section } from "@/components/ui/section";
import { platformMap } from "@/data/platforms";
import { databaseGate } from "@/lib/db-gate";
import { countOf } from "@/lib/plural";
import { emptyRecord } from "@/lib/track-record";
import { getSellerListings } from "@/server/listings";
import { getSeller, getSellerSlugs } from "@/server/sellers";
import { getSettings } from "@/server/settings";

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

  const description = `${seller.name} has completed ${seller.sales} supervised sales on Channel Adda and holds ${pointsLabel(seller.points ?? 0)}. Verified since ${seller.memberSince}.`;
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
  const [seller, { resellerPointsMultiplier }] = await Promise.all([
    getSeller(slug),
    getSettings(),
  ]);
  if (!seller) notFound();

  const active = await getSellerListings(seller.slug);
  const record = seller.record ?? emptyRecord();

  return (
    <>
      <div className="border-b border-line">
        <Container className="pt-8 pb-10 sm:pt-10 sm:pb-12">
          <Breadcrumbs
            className="mb-6"
            crumbs={[
              { label: "Home", href: "/" },
              { label: "Sellers", href: "/sellers" },
              { label: seller.name },
            ]}
          />

          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-4 sm:gap-5">
              <SellerAvatar
                initials={seller.initials}
                image={seller.image}
                className="size-16 text-lg sm:size-20 sm:text-xl"
              />
              <div className="min-w-0">
                <h1 className="flex flex-wrap items-center gap-2 text-[1.875rem] leading-[1.1] font-semibold tracking-[-0.03em] sm:text-[2.5rem]">
                  {seller.name}
                  <BadgeCheckIcon
                    aria-label="Verified seller"
                    className="size-6 shrink-0 text-verified"
                  />
                  {seller.reseller ? <ResellerBadge /> : null}
                </h1>
                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                  <span className="tnum font-semibold text-fg">
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

            {active.length ? (
              <Button
                asChild
                variant="secondary"
                size="md"
                className="shrink-0"
              >
                <Link href="#listings">
                  <MessageSquareIcon aria-hidden="true" className="size-4" />
                  Ask about a listing
                </Link>
              </Button>
            ) : null}
          </div>

          {/* Every completed deal, bought or sold, so a buyer sees the whole
              of someone's record here before deciding to deal with them. */}
          <dl className="mt-8 grid grid-cols-3 gap-x-6 gap-y-5 border-y border-line py-5">
            <Stat label="Deals done" value={String(record.deals)} />
            <Stat
              label="Deal worth"
              value={<Price usd={record.worthCents / 100} compact />}
            />
            <Stat label="Live listings" value={String(active.length)} />
          </dl>

          <p className="mt-5 flex items-start gap-2.5 text-[0.8125rem] leading-relaxed text-muted">
            <ShieldCheckIcon
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-verified"
            />
            <span>
              Rating points come only from deals that completed: half of what
              each deal was worth in dollars, bought or sold. A Reseller badge
              holder&apos;s count {resellerPointsMultiplier} times while their
              badge lasts.
            </span>
          </p>
        </Container>
      </div>

      <Section id="listings" className="scroll-mt-20">
        <Container>
          <h2 className="text-xl font-semibold tracking-[-0.02em] sm:text-2xl">
            {active.length
              ? `${active.length} live ${active.length === 1 ? "listing" : "listings"}`
              : "Live listings"}
          </h2>

          {active.length ? (
            <ul className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3 xl:grid-cols-3">
              {active.map((listing, i) => (
                <li key={listing.id}>
                  <ListingCard listing={listing} priority={i < 3} phoneRow />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              className="mt-6"
              title="No live listings right now"
              description={
                seller.sales
                  ? `${seller.name} has sold ${countOf(seller.sales, "account")} but has nothing on the market at the moment.`
                  : `${seller.name} has nothing on the market at the moment.`
              }
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

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[0.8125rem] text-subtle">{label}</dt>
      <dd className="tnum mt-1 flex items-baseline gap-1.5 text-xl font-semibold tracking-[-0.02em] text-fg">
        {value}
      </dd>
    </div>
  );
}
