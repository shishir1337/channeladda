import { BadgeCheckIcon, StarIcon, TimerIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Price } from "@/components/ui/price";
import { Container, Section } from "@/components/ui/section";
import { platformMap } from "@/data/platforms";
import { sellerAvatarSrc } from "@/data/sellers";
import { databaseGate } from "@/lib/db-gate";
import { getSellerListings } from "@/server/listings";
import { getSellers } from "@/server/sellers";

/** Marketplace data changes constantly; Prisma queries are invisible to Next's
 *  cache detection, so revalidation is declared explicitly. */
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Verified sellers",
  description:
    "Every Channel Adda seller is KYC-verified and rated only by buyers whose escrow-settled deals completed. Browse sellers by rating, volume and platform.",
  alternates: { canonical: "/sellers" },
};

export default async function SellersPage() {
  const gate = await databaseGate();
  if (gate) return gate;

  const topSellers = await getSellers();
  const liveCounts = Object.fromEntries(
    await Promise.all(
      topSellers.map(async (s) => [
        s.slug,
        (await getSellerListings(s.slug)).length,
      ]),
    ),
  ) as Record<string, number>;

  const totalSales = topSellers.reduce((n, s) => n + s.sales, 0);
  const totalVolume = topSellers.reduce((n, s) => n + s.volume, 0);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Home", href: "/" }, { label: "Sellers" }]}
        eyebrow="Verified sellers"
        title="The people behind the listings"
        description="Ratings come only from completed, escrow-settled orders. There is no way to buy a review here, which is what makes these numbers worth reading."
      >
        <dl className="mt-7 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Verified sellers" value={String(topSellers.length)} />
          <Stat
            label="Completed sales"
            value={totalSales.toLocaleString("en-US")}
          />
          <Stat
            label="Settled volume"
            value={<Price usd={totalVolume} compact />}
          />
        </dl>
      </PageHeader>

      <Section>
        <Container>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {topSellers.map((seller) => (
              <li key={seller.slug}>
                <article className="lift-card group relative flex h-full flex-col rounded-card border border-line bg-surface p-5 hover:border-primary/45 sm:p-6">
                  <div className="flex items-center gap-3.5">
                    {/* biome-ignore lint/performance/noImgElement: static SVG avatar. */}
                    <img
                      src={sellerAvatarSrc(seller.slug)}
                      alt=""
                      width={160}
                      height={160}
                      loading="lazy"
                      decoding="async"
                      className="size-14 shrink-0 rounded-full border-2 border-line"
                    />
                    <div className="min-w-0">
                      <h2 className="flex items-center gap-1.5 font-display text-base font-semibold">
                        <Link
                          href={`/seller/${seller.slug}`}
                          className="truncate"
                        >
                          {seller.name}
                          <span
                            aria-hidden="true"
                            className="absolute inset-0 rounded-card"
                          />
                        </Link>
                        <BadgeCheckIcon
                          aria-label="Verified seller"
                          className="size-4 shrink-0 text-verified"
                        />
                      </h2>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-subtle">
                        <StarIcon
                          aria-hidden="true"
                          className="size-3.5 fill-primary text-primary"
                        />
                        <span className="tnum text-muted">
                          {seller.rating.toFixed(1)}
                        </span>
                        <span className="truncate">
                          ({seller.reviews}) · {seller.country}
                        </span>
                      </p>
                    </div>
                  </div>

                  <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-5">
                    <div>
                      <dt className="text-[0.6875rem] text-subtle">Sales</dt>
                      <dd className="tnum mt-1 text-sm font-semibold">
                        {seller.sales}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[0.6875rem] text-subtle">Volume</dt>
                      <dd className="mt-1 text-sm font-semibold">
                        <Price usd={seller.volume} compact />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[0.6875rem] text-subtle">Live</dt>
                      <dd className="tnum mt-1 text-sm font-semibold">
                        {liveCounts[seller.slug]}
                      </dd>
                    </div>
                  </dl>

                  <p className="mt-4 flex items-center gap-1.5 text-xs text-muted">
                    <TimerIcon
                      aria-hidden="true"
                      className="size-3.5 text-verified"
                    />
                    Replies in{" "}
                    <span className="tnum font-medium text-fg">
                      ~{seller.responseMins} min
                    </span>
                    <span className="ml-auto text-subtle">
                      Since {seller.memberSince}
                    </span>
                  </p>

                  <div className="mt-auto flex flex-wrap gap-1.5 pt-5">
                    {seller.specialties.map((id) => {
                      const platform = platformMap[id];
                      return (
                        <Badge key={id}>
                          <platform.icon style={{ color: platform.tint }} />
                          {platform.name}
                        </Badge>
                      );
                    })}
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </Container>
      </Section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-surface px-4 py-3.5">
      <dt className="text-[0.6875rem] tracking-wide text-subtle uppercase">
        {label}
      </dt>
      <dd className="tnum mt-1 text-base font-semibold">{value}</dd>
    </div>
  );
}
