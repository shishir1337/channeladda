import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Price } from "@/components/ui/price";
import { Container, Section } from "@/components/ui/section";
import { platforms, totalListings } from "@/data/platforms";
import { sellers } from "@/data/sellers";

export const metadata: Metadata = {
  title: "About Channel Adda",
  description:
    "Why we built an escrow-first marketplace for social media accounts, and how the business actually makes money.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  const stats = [
    { label: "Live listings", value: totalListings.toLocaleString("en-US") },
    { label: "Platforms", value: String(platforms.length) },
    { label: "Verified sellers", value: String(sellers.length) },
    { label: "Settled", value: <Price usd={48_200_000} compact /> },
  ];

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Home", href: "/" }, { label: "About" }]}
        eyebrow="About us"
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
              be the one where the money is never at risk — where a payment sits
              with us until the buyer can prove they hold the account, and where
              the wait before payout is set by how long the platform actually
              lets an old owner take it back.
            </p>
            <p className="text-fg">
              That is the whole product. Everything else — the search, the
              filters, the seller ratings — exists to get two people to the
              point where escrow can do its job.
            </p>
            <p>
              We make money one way: a percentage when a deal completes. Not on
              listings, not on subscriptions, not on advertising. If your sale
              falls through we earn nothing, which is exactly the incentive we
              want.
            </p>
          </div>

          <dl className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-card border border-line bg-surface px-4 py-4"
              >
                <dt className="text-[0.6875rem] tracking-wide text-subtle uppercase">
                  {s.label}
                </dt>
                <dd className="tnum mt-1 text-lg font-semibold">{s.value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-12 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/browse">Browse the marketplace</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/how-it-works">See how escrow works</Link>
            </Button>
          </div>
        </Container>
      </Section>
    </>
  );
}
