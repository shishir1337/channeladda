import {
  ArrowRightIcon,
  BadgeCheckIcon,
  CheckIcon,
  LockIcon,
  WalletIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Price } from "@/components/ui/price";
import { Container, Section, SectionHeading } from "@/components/ui/section";
import { platforms } from "@/data/platforms";
import { formatRate, sellerPayout } from "@/lib/fees";
import { getFeeSettings } from "@/server/settings";

export const metadata: Metadata = {
  title: "Sell your account",
  description:
    "List a YouTube channel, Instagram or Facebook page, Telegram channel or website for free. Escrow proves the buyer is real, and you are paid in crypto once the handover is confirmed.",
  alternates: { canonical: "/sell" },
};

const steps = [
  {
    title: "Publish your listing",
    body: "Add the handle, the metrics and your asking price. Free, and it takes about ten minutes. We ask one question most marketplaces do not: exactly how your account is set up, because that decides whether a transfer is a two-hour job or a two-week one.",
  },
  {
    title: "Prove you own it",
    body: "We give you a one-time code to paste into your bio or description, and we read it live. No screenshot can fake that, which is why buyers here trust listings they have never seen before.",
  },
  {
    title: "Field offers in one place",
    body: "Accept, reject or counter. Everything stays inside Channel Adda, so the price you agreed is on record if anything is ever disputed.",
  },
  {
    title: "Get paid in crypto",
    body: "The buyer's money is secured before you hand anything over. Once they confirm the handover and the cooling-off period passes, your balance is released to your own wallet.",
  },
];

/** A worked example beats a fee table — sellers want the number they receive. */
const EXAMPLE = 42_500;

export default async function SellPage() {
  const fees = await getFeeSettings();
  const { fee, payout } = sellerPayout(EXAMPLE, fees);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Home", href: "/" }, { label: "Sell" }]}
        eyebrow="For sellers"
        title="Your channel is an asset. Cash it out safely."
        description="List for free, put your account in front of active buyers, and let escrow prove you are dealing with someone serious. We only earn when your deal completes."
        actions={
          <Button asChild size="lg">
            <Link href="/signup">
              Create a free listing
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </Link>
          </Button>
        }
      >
        <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2.5">
          {[
            "Free to list",
            "No exclusivity",
            "Payout in under an hour",
            "You set the price",
          ].map((point) => (
            <li
              key={point}
              className="inline-flex items-center gap-2 text-sm text-muted"
            >
              <CheckIcon
                aria-hidden="true"
                className="size-4 shrink-0 text-verified"
              />
              {point}
            </li>
          ))}
        </ul>
      </PageHeader>

      <Section>
        <Container>
          <SectionHeading
            eyebrow="How selling works"
            title="Four steps, and you never hand over an account on trust"
          />

          <ol className="mt-9 grid gap-4 sm:mt-12 sm:grid-cols-2">
            {steps.map((step, i) => (
              <li key={step.title}>
                <div className="flex h-full flex-col rounded-card border border-line bg-surface p-5 sm:p-6">
                  <span className="tnum font-display text-sm font-bold text-primary-text">
                    0{i + 1}
                  </span>
                  <h3 className="mt-3 font-display text-lg font-semibold">
                    {step.title}
                  </h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-muted">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Container>
      </Section>

      <Section className="border-y border-line bg-bg-subtle">
        <Container>
          <div className="lg:grid lg:grid-cols-2 lg:items-center lg:gap-16">
            <div className="max-w-xl">
              <SectionHeading
                eyebrow="Fees"
                title="What you actually take home"
                description="No listing fee and no monthly cost. A success fee is deducted only when a deal completes, and the buyer pays their own fee on top of your asking price."
              />
              <Button asChild variant="outline" size="md" className="mt-7">
                <Link href="/fees">See the full fee breakdown</Link>
              </Button>
            </div>

            <div className="mt-8 rounded-panel border border-line bg-surface p-6 shadow-soft sm:p-8 lg:mt-0">
              <p className="text-xs font-semibold tracking-[0.14em] text-subtle uppercase">
                Worked example
              </p>
              <dl className="mt-5 space-y-3 text-sm">
                <Row
                  label="Your asking price"
                  value={<Price usd={EXAMPLE} />}
                />
                <Row
                  label={`Seller fee (${formatRate(fees.sellerFeeBp)}%)`}
                  value={
                    <span className="text-danger">
                      −<Price usd={fee} />
                    </span>
                  }
                />
                <div className="flex items-center justify-between gap-3 border-t border-line pt-3 text-base font-semibold">
                  <dt>You receive</dt>
                  <dd className="text-verified">
                    <Price usd={payout} />
                  </dd>
                </div>
              </dl>
              <p className="mt-4 border-t border-line pt-4 text-xs leading-relaxed text-subtle">
                The buyer pays {formatRate(fees.buyerFeeBp)}% on top of your
                price, so your listing stays at{" "}
                <Price usd={EXAMPLE} className="text-muted" /> on the
                marketplace.
              </p>
            </div>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <SectionHeading
            eyebrow="What you can sell"
            title="Five marketplaces, one listing flow"
            description="Each platform has its own transfer mechanism, so each has its own checklist and its own escrow hold. Pick yours to see how the handover works."
          />

          <ul className="mt-9 grid grid-cols-2 gap-3 sm:mt-12 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {platforms.map((platform) => (
              <li key={platform.id}>
                <Link
                  href={`/browse/${platform.id}`}
                  className="lift-card group flex h-full flex-col gap-3 rounded-card border border-line bg-surface p-4 hover:border-primary/45 sm:p-5"
                >
                  <span
                    className="flex size-11 items-center justify-center rounded-xl border border-line bg-surface-2"
                    style={{ color: platform.tint }}
                  >
                    <platform.icon className="size-5" />
                  </span>
                  <h3 className="font-display text-sm font-semibold sm:text-base">
                    {platform.name}
                  </h3>
                  <p className="text-xs text-subtle">
                    <span className="tnum">{platform.holdDays}</span>-day escrow
                    hold
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      <Section className="border-t border-line bg-bg-subtle">
        <Container>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                icon: LockIcon,
                title: "You are protected too",
                body: "A buyer cannot vanish mid-deal with your credentials. Their money is already secured before you start the handover.",
              },
              {
                icon: BadgeCheckIcon,
                title: "Reputation that follows you",
                body: "Every completed sale adds to a rating buyers can see. It is the reason a second sale is easier than the first.",
              },
              {
                icon: WalletIcon,
                title: "Paid in crypto",
                body: "Payouts settle to your own Cryptomus wallet, usually within an hour of the cooling-off period ending.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-card border border-line bg-surface p-5 sm:p-6"
              >
                <span className="flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary-text">
                  <item.icon aria-hidden="true" className="size-5" />
                </span>
                <h3 className="mt-4 font-display text-base font-semibold">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {item.body}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-col items-start gap-4 rounded-panel border border-line bg-surface p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div className="max-w-lg">
              <h2 className="font-display text-xl font-bold sm:text-2xl">
                Ready to list?
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Creating an account takes about fifteen seconds and needs no
                documents. Identity checks only come in before your first
                listing goes live.
              </p>
            </div>
            <Button asChild size="lg" className="shrink-0">
              <Link href="/signup">
                Create a free listing
                <ArrowRightIcon aria-hidden="true" className="size-4" />
              </Link>
            </Button>
          </div>
        </Container>
      </Section>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
