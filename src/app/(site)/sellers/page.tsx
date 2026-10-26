import { ChevronRightIcon, UsersIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { pointsLabel, ResellerBadge } from "@/components/app/reseller-badge";
import { VerifiedMark } from "@/components/app/verified-mark";
import { SellerAvatar } from "@/components/site/seller-avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { HUE_TILE } from "@/components/ui/icon-hue";
import { PageHeader } from "@/components/ui/page-header";
import { Price } from "@/components/ui/price";
import { Container, Section } from "@/components/ui/section";
import { platformMap } from "@/data/platforms";
import { databaseGate } from "@/lib/db-gate";
import { countOf } from "@/lib/plural";
import { type Medal, medalFor, ordinal } from "@/lib/seller-rank";
import { pageMetadata } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { getSellers, type RankedSeller } from "@/server/sellers";

/** Marketplace data changes constantly; Prisma queries are invisible to Next's
 *  cache detection, so revalidation is declared explicitly. */
export const revalidate = 60;

export const metadata: Metadata = pageMetadata({
  title: "Top sellers",
  description:
    "Every verified Channel Adda seller, ranked by rating points earned only from deals that completed. See who has sold the most, and what they sell.",
  path: "/sellers",
});

/**
 * Gold, silver and bronze in the site's own colours: gold is the yellow that
 * points and standing already wear (`icon-hue`), bronze the orange beside it,
 * silver a wash of the page's own grey. Three marks that read apart at a
 * glance, on rows that are otherwise the same as everyone else's.
 *
 * The tile's 600 shade is for icons; the place is a number to read, so it
 * takes the deeper text shade the tinted badges use (`ui/badge`).
 */
const MEDAL: Record<Medal, { mark: string; avatar: string; row: string }> = {
  gold: {
    mark: cn(HUE_TILE.yellow, "text-yellow-700 dark:text-yellow-300"),
    avatar: "ring-2 ring-yellow-500/50",
    row: "bg-yellow-500/[0.05]",
  },
  silver: {
    mark: "border-subtle/40 bg-subtle/15 text-fg",
    avatar: "ring-2 ring-subtle/60",
    row: "bg-subtle/[0.06]",
  },
  bronze: {
    mark: cn(HUE_TILE.orange, "text-orange-700 dark:text-orange-300"),
    avatar: "ring-2 ring-orange-500/40",
    row: "bg-orange-500/[0.04]",
  },
};

export default async function SellersPage() {
  const gate = await databaseGate();
  if (gate) return gate;

  // Every verified seller, already in rank order, in one batch of queries.
  const sellers = await getSellers();
  const totalSales = sellers.reduce((n, s) => n + s.sales, 0);
  const totalVolume = sellers.reduce((n, s) => n + s.volume, 0);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Home", href: "/" }, { label: "Sellers" }]}
        title="Top sellers"
        description="Every verified seller, ranked by rating points. Points come only from deals that completed: half of what each deal was worth, in dollars."
      >
        <dl className="mt-7 grid grid-cols-3 gap-6 border-y border-line py-5">
          {/* Totals for the sellers listed, and only them: a sale by a
              seller who is not verified is on /sold but not here. */}
          <Stat label="Verified sellers" value={String(sellers.length)} />
          <Stat
            label="Their completed sales"
            value={totalSales.toLocaleString("en-US")}
          />
          <Stat
            label="Their settled value"
            value={<Price usd={totalVolume} compact />}
          />
        </dl>
      </PageHeader>

      <Section>
        <Container>
          {sellers.length === 0 ? (
            <EmptyState
              icon={UsersIcon}
              title="No verified sellers yet"
              description="Sellers show here once they are verified, ranked by the points their completed deals earn."
              action={
                <Button asChild variant="secondary">
                  <Link href="/sell">Start selling</Link>
                </Button>
              }
            />
          ) : (
            <>
              <div className="overflow-hidden rounded-card border border-line bg-surface">
                {/* Column names for the wide row. A list, not a table, so
                    each figure also carries its name for screen readers. */}
                <div
                  aria-hidden="true"
                  className="hidden items-center gap-4 border-b border-line px-5 py-2.5 text-xs font-medium text-subtle md:flex"
                >
                  <span className="w-9 text-center">Rank</span>
                  <span className="min-w-0 flex-1 pl-14">Seller</span>
                  <span className="w-24 text-right">Points</span>
                  <span className="w-12 text-right">Sales</span>
                  <span className="w-16 text-right">Settled</span>
                  <span className="w-14 text-right">For sale</span>
                  <span className="w-4" />
                </div>
                <ol aria-label="Sellers by rating points">
                  {sellers.map((seller) => (
                    <SellerRow key={seller.slug} seller={seller} />
                  ))}
                </ol>
              </div>
              <p className="mt-4 text-[0.8125rem] text-subtle">
                Same points? More completed sales goes first, then whoever
                joined earlier.
              </p>
            </>
          )}
        </Container>
      </Section>
    </>
  );
}

function SellerRow({ seller }: { seller: RankedSeller }) {
  const points = seller.points ?? 0;
  const medal = medalFor(seller.rank, points);

  return (
    <li
      className={cn(
        "relative flex items-center gap-3 border-b border-line px-4 py-3.5 transition-colors duration-150 last:border-b-0 hover:bg-surface-2/70 md:gap-4 md:px-5",
        medal && MEDAL[medal].row,
      )}
    >
      <RankMark rank={seller.rank} medal={medal} />
      <SellerAvatar
        initials={seller.initials}
        image={seller.image}
        className={cn("size-10 text-[0.8125rem]", medal && MEDAL[medal].avatar)}
      />

      <div className="min-w-0 flex-1">
        <h2 className="flex min-w-0 items-center gap-1.5 text-[0.9375rem] font-semibold">
          <Link href={`/seller/${seller.slug}`} className="truncate">
            {seller.name}
            {/* The whole row opens their page. */}
            <span aria-hidden="true" className="absolute inset-0" />
          </Link>
          {seller.verified ? (
            <VerifiedMark
              detail={seller.verifiedWith}
              country={seller.country}
            />
          ) : null}
          {seller.reseller ? <ResellerBadge /> : null}
        </h2>

        {/* A phone has the two figures the place is decided by under the
            name; a wide screen has every figure in its own column. */}
        <p className="tnum mt-0.5 truncate text-[0.8125rem] text-subtle md:hidden">
          <span className="font-medium text-fg">{pointsLabel(points)}</span>
          {" · "}
          {countOf(seller.sales, "sale")}
        </p>

        <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[0.8125rem] text-subtle">
          <span className="truncate">{seller.country}</span>
          {seller.specialties.length > 0 ? (
            <span className="flex shrink-0 items-center gap-1 pl-0.5">
              {seller.specialties.map((id) => {
                const platform = platformMap[id];
                return (
                  <span key={id} style={{ color: platform.tint }}>
                    <platform.icon aria-hidden="true" className="size-3.5" />
                    <span className="sr-only">{platform.name}</span>
                  </span>
                );
              })}
            </span>
          ) : null}
        </p>
      </div>

      <Figure label="Points" className="w-24 font-semibold text-fg">
        {points.toLocaleString("en-US")}
      </Figure>
      <Figure label="Sales" className="w-12">
        {seller.sales.toLocaleString("en-US")}
      </Figure>
      <Figure label="Settled" className="w-16">
        <Price usd={seller.volume} compact />
      </Figure>
      <Figure label="For sale" className="w-14">
        {seller.live.toLocaleString("en-US")}
      </Figure>
      <ChevronRightIcon
        aria-hidden="true"
        className="hidden size-4 shrink-0 text-subtle md:block"
      />
    </li>
  );
}

/** The place: a medal for the top three, a plain number for everyone else. */
function RankMark({ rank, medal }: { rank: number; medal: Medal | null }) {
  return (
    <span
      className={cn(
        "tnum flex h-8 min-w-8 shrink-0 items-center justify-center text-sm md:h-9 md:min-w-9",
        medal
          ? cn("rounded-full border font-semibold", MEDAL[medal].mark)
          : "font-medium text-subtle",
      )}
    >
      <span className="sr-only">{ordinal(rank)} place</span>
      <span aria-hidden="true">{rank}</span>
    </span>
  );
}

/** One figure in its column on a wide screen; a phone leaves the columns out. */
function Figure({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "tnum hidden shrink-0 text-right text-sm text-muted md:block",
        className,
      )}
    >
      <span className="sr-only">{label}: </span>
      {children}
    </span>
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
