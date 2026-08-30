import { ArrowRightIcon, ShieldCheckIcon, TimerIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BrowseView } from "@/components/browse/browse-view";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Price } from "@/components/ui/price";
import { type PlatformId, platformMap, platforms } from "@/data/platforms";
import { databaseGate } from "@/lib/db-gate";
import { parseFilters } from "@/lib/listing-query";
import { getPlatformCounts, queryListings } from "@/server/listings";

export function generateStaticParams() {
  return platforms.map((p) => ({ platform: p.id }));
}

/** The five platforms are the complete set, so anything else is a real 404
 *  rather than a soft one that search engines would index. */
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: PageProps<"/browse/[platform]">): Promise<Metadata> {
  const { platform } = await params;
  const p = platformMap[platform as PlatformId];
  if (!p) return { title: "Platform not found" };

  const counts = await getPlatformCounts();
  const title = `Buy ${p.name} ${p.assetNoun} — ${counts[p.id].toLocaleString("en-US")} for sale`;
  return {
    title,
    description: p.blurb,
    openGraph: { title, description: p.blurb },
    alternates: { canonical: `/browse/${p.id}` },
  };
}

export default async function PlatformBrowsePage({
  params,
  searchParams,
}: PageProps<"/browse/[platform]">) {
  const gate = await databaseGate();
  if (gate) return gate;

  const { platform } = await params;
  const p = platformMap[platform as PlatformId];
  if (!p) notFound();

  // The platform comes from the path, so it always overrides the query string.
  const filters = { ...parseFilters(await searchParams), platforms: [p.id] };
  const [result, counts] = await Promise.all([
    queryListings(filters),
    getPlatformCounts(),
  ]);

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Browse", href: "/browse" },
          { label: p.name },
        ]}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span
              className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface sm:size-14"
              style={{ color: p.tint }}
            >
              <p.icon className="size-6 sm:size-7" />
            </span>
            {p.name} {p.assetNoun} for sale
          </span>
        }
        description={p.blurb}
      >
        <dl className="mt-7 grid gap-4 sm:grid-cols-3">
          <Stat
            label="Live listings"
            value={counts[p.id].toLocaleString("en-US")}
          />
          <Stat label="Starting from" value={<Price usd={p.startingPrice} />} />
          <Stat
            label="Escrow hold"
            value={`${p.holdDays} days`}
            icon={<TimerIcon aria-hidden="true" className="size-4" />}
          />
        </dl>
      </PageHeader>

      <BrowseView
        filters={filters}
        result={result}
        basePath={`/browse/${p.id}`}
        hidePlatform
      />

      {/* Genuinely platform-specific content — the reason this page exists
          separately from /browse rather than being a filtered duplicate. */}
      <section className="border-t border-line bg-bg-subtle">
        <div className="mx-auto w-full max-w-[81rem] px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center lg:gap-16">
            <div className="max-w-2xl">
              <Badge variant="verified" size="md">
                <ShieldCheckIcon aria-hidden="true" />
                Transfer &amp; escrow
              </Badge>
              <h2 className="mt-4 text-[1.5rem] leading-[1.2] font-bold sm:text-3xl">
                How a {p.name} handover actually works
              </h2>
              <p className="mt-4 text-[0.9375rem] leading-relaxed text-muted sm:text-base">
                {p.transferNote}
              </p>
              <p className="mt-4 text-[0.9375rem] leading-relaxed text-muted sm:text-base">
                Your payment stays with Channel Adda for{" "}
                <span className="font-semibold text-fg">{p.holdDays} days</span>{" "}
                after you confirm the handover. If the previous owner recovers
                the account in that window, you are refunded in full.
              </p>
              <Link
                href="/how-it-works"
                className="mt-6 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary-text transition-colors hover:text-fg"
              >
                See the full escrow process
                <ArrowRightIcon aria-hidden="true" className="size-4" />
              </Link>
            </div>

            <ul className="flex flex-wrap gap-2 lg:max-w-xs lg:flex-col">
              {platforms
                .filter((other) => other.id !== p.id)
                .map((other) => (
                  <li key={other.id}>
                    <Link
                      href={`/browse/${other.id}`}
                      className="inline-flex min-h-11 w-full items-center gap-2.5 rounded-xl border border-line bg-surface px-4 text-sm font-medium text-muted transition-colors hover:border-line-strong hover:text-fg"
                    >
                      <other.icon
                        className="size-4 shrink-0"
                        style={{ color: other.tint }}
                      />
                      {other.name} {other.assetNoun}
                      <span className="tnum ml-auto text-xs text-subtle">
                        {counts[other.id].toLocaleString("en-US")}
                      </span>
                    </Link>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      </section>
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
