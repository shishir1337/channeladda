import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Container, Section } from "@/components/ui/section";
import { platforms } from "@/data/platforms";
import { databaseGate } from "@/lib/db-gate";
import { pageMetadata } from "@/lib/seo";
import { getPlatformCounts } from "@/server/listings";
import { getSellerSlugs } from "@/server/sellers";

/** Counts from the marketplace itself, refreshed like the pages they echo. */
export const revalidate = 60;

export const metadata: Metadata = pageMetadata({
  title: "About Channel Adda",
  description:
    "Why we built a supervised marketplace for social media accounts, and how the business actually makes money.",
  path: "/about",
});

export default async function AboutPage() {
  const gate = await databaseGate();
  if (gate) return gate;

  // These were the sample data's totals — 9,140 listings beside a
  // marketplace showing 43 — so they are read from the database now.
  // The same sellers /sellers lists, counted rather than built.
  const [counts, sellers] = await Promise.all([
    getPlatformCounts(),
    getSellerSlugs(),
  ]);
  const live = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const stats = [
    { label: "Live listings", value: live.toLocaleString("en-US") },
    { label: "Platforms", value: String(platforms.length) },
    {
      label: "Verified sellers",
      value: sellers.length.toLocaleString("en-US"),
    },
  ];

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Home", href: "/" }, { label: "About" }]}
        title="We built the middle of the deal"
        description="Channel Adda exists because two strangers on opposite sides of the world both need to move first, and neither can afford to."
      />

      <Section>
        <Container className="max-w-3xl">
          <div className="flex flex-col gap-5 text-[1.0625rem] leading-relaxed text-muted">
            <p>
              Accounts have been bought and sold in Telegram groups and forum
              threads for years. The pattern is always the same: one side is
              asked to hand over a login, or send money, on nothing more than a
              stranger&apos;s word. Most of the time it works. When it does not,
              there is no record, no recourse and nobody to appeal to.
            </p>
            <p>
              We are not trying to be the biggest marketplace. We are trying to
              be the one where neither side has to go first on trust — where
              something real sits between the two of them until the handover is
              done, and where the wait is set by how long the platform actually
              lets an old owner take the account back. Sometimes that something
              is the buyer&rsquo;s money. Sometimes it is the account itself. It
              is never nothing.
            </p>
            <p className="text-fg">
              That is the whole product. Everything else — the search, the
              filters, the seller ratings — exists to get two people to the
              point where a supervised handover can do its job.
            </p>
            <p>
              We make money on deals: a percentage when one opens, and the
              optional Reseller badge for people who trade often. Not on
              listings and not on advertising. If a deal falls through before
              our agent takes custody, our fee is refunded in full, which is
              exactly the incentive we want.
            </p>
          </div>

          <dl className="mt-12 grid grid-cols-3 gap-6 border-y border-line py-6">
            {stats.map((s) => (
              <div key={s.label}>
                <dt className="text-[0.8125rem] text-subtle">{s.label}</dt>
                <dd className="tnum mt-1 text-2xl font-semibold tracking-[-0.02em] text-fg">
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-12 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/browse">Browse the marketplace</Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href="/how-it-works">See how a deal works</Link>
            </Button>
          </div>
        </Container>
      </Section>
    </>
  );
}
