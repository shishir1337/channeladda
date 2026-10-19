import { BadgeCheckIcon, TimerIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ResellerBadge } from "@/components/app/reseller-badge";
import { SellerAvatar } from "@/components/site/seller-avatar";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Price } from "@/components/ui/price";
import { Container, Section } from "@/components/ui/section";
import { Stars } from "@/components/ui/stars";
import { platformMap } from "@/data/platforms";
import { databaseGate } from "@/lib/db-gate";
import { countOf } from "@/lib/plural";
import { getSellerListings } from "@/server/listings";
import { getSellers } from "@/server/sellers";

/** Marketplace data changes constantly; Prisma queries are invisible to Next's
 *  cache detection, so revalidation is declared explicitly. */
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Verified sellers",
  description:
    "Every Channel Adda seller is KYC-verified and rated only by buyers whose deals actually completed. Browse sellers by rating, volume and platform.",
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
        title="The people behind the listings"
        description="Ratings come only from deals that completed. There is no way to buy a review here, which is what makes these numbers worth reading."
      >
        <dl className="mt-7 grid grid-cols-3 gap-6 border-y border-line py-5">
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
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {topSellers.map((seller) => (
              <li key={seller.slug}>
                <article className="lift-card group relative flex h-full flex-col rounded-card border border-line bg-surface p-5 hover:border-line-strong">
                  <div className="flex items-center gap-3">
                    <SellerAvatar initials={seller.initials} />
                    <div className="min-w-0">
                      <h2 className="flex items-center gap-1.5 text-[0.9375rem] font-semibold">
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
                        {seller.reseller ? <ResellerBadge /> : null}
                      </h2>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[0.8125rem] text-subtle">
                        {seller.rating !== null ? (
                          <>
                            <Stars rating={seller.rating} />
                            <span className="tnum font-medium text-fg">
                              {seller.rating.toFixed(1)}
                            </span>
                            <span className="tnum truncate">
                              {countOf(seller.reviews, "review")} ·{" "}
                              {seller.country}
                            </span>
                          </>
                        ) : (
                          <span className="truncate">
                            <span className="font-medium text-fg">New</span> ·{" "}
                            {seller.country}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4">
                    <div>
                      <dt className="text-xs text-subtle">Sales</dt>
                      <dd className="tnum mt-0.5 text-sm font-semibold">
                        {seller.sales}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-subtle">Volume</dt>
                      <dd className="mt-0.5 text-sm font-semibold">
                        <Price usd={seller.volume} compact />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-subtle">Live</dt>
                      <dd className="tnum mt-0.5 text-sm font-semibold">
                        {liveCounts[seller.slug]}
                      </dd>
                    </div>
                  </dl>

                  <p className="mt-4 flex items-center gap-1.5 text-[0.8125rem] text-muted">
                    <TimerIcon
                      aria-hidden="true"
                      className="size-3.5 text-subtle"
                    />
                    Replies in{" "}
                    <span className="tnum font-medium text-fg">
                      ~{seller.responseMins} min
                    </span>
                    <span className="ml-auto text-subtle">
                      Since {seller.memberSince}
                    </span>
                  </p>

                  <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
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
    <div>
      <dt className="text-[0.8125rem] text-subtle">{label}</dt>
      <dd className="tnum mt-1 text-xl font-semibold tracking-[-0.02em] text-fg sm:text-2xl">
        {value}
      </dd>
    </div>
  );
}
