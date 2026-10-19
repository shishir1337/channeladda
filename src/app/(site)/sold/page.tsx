import { CheckCircle2Icon, TimerIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Price } from "@/components/ui/price";
import { Container, Section } from "@/components/ui/section";
import { soldAgoLabel } from "@/data/listings";
import { platformMap } from "@/data/platforms";
import { databaseGate } from "@/lib/db-gate";
import { formatCompact } from "@/lib/utils";
import { getRecentlySold } from "@/server/listings";

/** Marketplace data changes constantly; Prisma queries are invisible to Next's
 *  cache detection, so revalidation is declared explicitly. */
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Recently sold accounts",
  description:
    "Every completed Channel Adda sale, with the settled price and how long the deal took. Real transaction history rather than asking prices.",
  alternates: { canonical: "/sold" },
};

/** Groups keep the page scannable and make recency obvious at a glance. */
const groups = [
  { label: "Today", test: (h: number) => h < 24 },
  { label: "This week", test: (h: number) => h >= 24 && h < 24 * 7 },
  { label: "Earlier", test: (h: number) => h >= 24 * 7 },
];

export default async function SoldPage() {
  const gate = await databaseGate();
  if (gate) return gate;

  const sorted = await getRecentlySold();
  const totalValue = sorted.reduce((n, s) => n + s.price, 0);
  // Dividing by nothing rendered “Median close NaN days” on the public page
  // of a deployment that had not sold anything yet. And it was a mean, not
  // a median, which on a handful of deals is the more misleading of the two.
  const closeDays = sorted.map((s) => s.daysToClose).sort((a, b) => a - b);
  const medianDays =
    closeDays.length === 0
      ? null
      : closeDays.length % 2 === 1
        ? closeDays[(closeDays.length - 1) / 2]
        : Math.round(
            (closeDays[closeDays.length / 2 - 1] +
              closeDays[closeDays.length / 2]) /
              2,
          );

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Home", href: "/" }, { label: "Recently sold" }]}
        title="What accounts actually sell for"
        description="Asking prices are easy to find. These are settled prices — what a buyer really paid after negotiation, on a deal that completed and a seller who was paid."
      >
        <dl className="mt-7 grid grid-cols-3 gap-6 border-y border-line py-5">
          <Stat label="Deals shown" value={String(sorted.length)} />
          <Stat
            label="Settled value"
            value={<Price usd={totalValue} compact />}
          />
          <Stat
            label="Median close"
            value={medianDays === null ? "—" : `${medianDays} days`}
          />
        </dl>
      </PageHeader>

      <Section>
        <Container>
          {groups.map((group) => {
            const items = sorted.filter((s) => group.test(s.soldHoursAgo));
            if (!items.length) return null;

            return (
              <section key={group.label} className="mb-10 last:mb-0">
                <h2 className="flex items-center gap-2.5 text-lg font-semibold">
                  {group.label}
                  <span className="tnum rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted">
                    {items.length}
                  </span>
                </h2>

                <ul className="mt-4 overflow-hidden rounded-card border border-line bg-surface">
                  {items.map((item) => {
                    const platform = platformMap[item.platform];
                    return (
                      <li
                        key={item.id}
                        className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-4 last:border-b-0 sm:flex-nowrap sm:px-5"
                      >
                        <span
                          className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2"
                          style={{ color: platform.tint }}
                        >
                          <platform.icon className="size-4" />
                          <span className="sr-only">{platform.name}</span>
                        </span>

                        <span className="min-w-0 flex-1 basis-40">
                          <span className="block truncate text-sm font-semibold">
                            {item.handle}
                          </span>
                          <span className="block truncate text-xs text-subtle">
                            {platform.name} · {item.niche}
                          </span>
                        </span>

                        <span className="tnum shrink-0 text-xs text-muted sm:w-24 sm:text-sm">
                          {formatCompact(item.audience)}
                          <span className="ml-1 text-subtle sm:hidden">
                            {platform.metricLabel.toLowerCase()}
                          </span>
                        </span>

                        <span className="hidden shrink-0 items-center gap-1.5 text-xs text-subtle sm:flex sm:w-28">
                          <TimerIcon aria-hidden="true" className="size-3.5" />
                          {item.daysToClose} days
                        </span>

                        <span className="ml-auto shrink-0 text-right">
                          <Price
                            usd={item.price}
                            className="block text-base font-semibold text-fg"
                          />
                          <span className="block text-xs text-subtle">
                            {soldAgoLabel(item.soldHoursAgo)}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}

          <div className="mt-10 flex flex-col items-start gap-4 rounded-panel border border-line bg-surface p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div className="max-w-lg">
              <h2 className="flex items-center gap-2.5 text-lg font-semibold">
                <CheckCircle2Icon
                  aria-hidden="true"
                  className="size-5 text-verified"
                />
                Every one of these was supervised by an agent
              </h2>
              <p className="mt-2.5 text-sm leading-relaxed text-muted">
                The buyer confirmed the handover before the deal closed, and
                nobody was asked to hand over an account they had not been paid
                for.
              </p>
            </div>
            <Button asChild size="lg" className="shrink-0">
              <Link href="/browse">Browse what is on sale now</Link>
            </Button>
          </div>
        </Container>
      </Section>
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "verified";
}) {
  return (
    <div>
      <dt className="text-[0.8125rem] text-subtle">{label}</dt>
      <dd
        className={`tnum mt-1 text-2xl font-semibold tracking-[-0.02em] ${tone === "verified" ? "text-verified" : "text-fg"}`}
      >
        {value}
      </dd>
    </div>
  );
}
