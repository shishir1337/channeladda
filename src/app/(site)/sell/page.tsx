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
    "List a YouTube channel, Instagram or Facebook page, Telegram channel or website for free. A supervised handover proves the buyer is real, and you are paid in crypto once it is confirmed.",
  alternates: { canonical: "/sell" },
};

const steps = [
  {
    title: "Publish your listing",
    body: "Add the handle, the metrics and your asking price. Free, and it takes about ten minutes. We ask one question most marketplaces do not: exactly how your account is set up, because that decides whether a transfer is a two-hour job or a two-week one.",
  },
  {
    title: "Prove you own it",
    body: "Paste a one-time code into your description. On YouTube we check it automatically and your listing goes live at once; elsewhere a moderator checks it.",
  },
  {
    title: "Field offers in one place",
    body: "Accept, reject or counter. Everything stays inside Channel Adda, so the price you agreed is on record if anything is ever disputed.",
  },
  {
    title: "Get paid, either way",
    body: "On a Fastest deal the buyer's money is with us before you hand anything over, and reaches your Channel Adda balance once our agent holds it. On a Safest deal you give the account to our agent first, the buyer pays you directly, and our agent hands it on only after you confirm the money arrived. Either way you never hand over an account you have not been paid for.",
  },
];

/** A worked example beats a fee table — sellers want the number they receive. */
const EXAMPLE = 42_500;

export default async function SellPage() {
  const fees = await getFeeSettings();
  const { fee, payout } = sellerPayout(EXAMPLE, fees, "FASTEST");

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Home", href: "/" }, { label: "Sell" }]}
        title="Your channel is an asset. Cash it out safely."
        description="List for free, put your account in front of active buyers, and let a supervised handover prove you are dealing with someone serious. We earn a fee on deals, never on listings."
        actions={
          <Button asChild size="lg">
            <Link href="/signup?next=%2Fdashboard%2Flistings%2Fnew">
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
            "Paid when the deal completes",
            "You set the price",
          ].map((point) => (
            <li
              key={point}
              className="inline-flex items-center gap-2 text-sm text-muted"
            >
              <CheckIcon
                aria-hidden="true"
                className="size-4 shrink-0 text-fg"
              />
              {point}
            </li>
          ))}
        </ul>
      </PageHeader>

      <Section>
        <Container>
          <SectionHeading title="Four steps, and you never hand over an account on trust" />

          <ol className="mt-8 grid gap-3 sm:mt-10 sm:grid-cols-2">
            {steps.map((step, i) => (
              <li key={step.title}>
                <div className="flex h-full flex-col rounded-card border border-line bg-surface p-5 sm:p-6">
                  <span className="tnum text-[0.8125rem] font-medium text-subtle">
                    Step {i + 1}
                  </span>
                  <h3 className="mt-2 text-base font-semibold text-fg">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
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
                title="What you actually take home"
                description={
                  fees.sellerFeeBp > 0
                    ? "No listing fee and no monthly cost. A success fee is deducted only when a Fastest sale is paid out, and the buyer pays their own fee on top of your asking price."
                    : "No listing fee, no monthly cost and no seller fee. The buyer pays their own fee on top of your asking price."
                }
              />
              <Button asChild variant="secondary" size="md" className="mt-7">
                <Link href="/fees">See the full fee breakdown</Link>
              </Button>
            </div>

            <div className="mt-8 rounded-panel border border-line bg-surface p-6 sm:p-8 lg:mt-0">
              <p className="text-[0.8125rem] font-medium text-subtle">
                A Fastest sale, worked through
              </p>
              <dl className="mt-5 space-y-3 text-sm">
                <Row
                  label="Your asking price"
                  value={<Price usd={EXAMPLE} />}
                />
                {fees.sellerFeeBp > 0 ? (
                  <Row
                    label={`Seller fee (${formatRate(fees.sellerFeeBp)}%)`}
                    value={
                      <>
                        −<Price usd={fee} />
                      </>
                    }
                  />
                ) : (
                  <Row label="Seller fee" value="None" />
                )}
                <div className="flex items-center justify-between gap-3 border-t border-line pt-3 text-base font-semibold">
                  <dt>You receive</dt>
                  <dd className="tnum text-fg">
                    <Price usd={payout} />
                  </dd>
                </div>
              </dl>
              <p className="mt-4 border-t border-line pt-4 text-xs leading-relaxed text-subtle">
                The buyer pays {formatRate(fees.buyerFeeBpSafest)}% on top of
                your price, so your listing stays at{" "}
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
            title="Five marketplaces, one listing flow"
            description="Each platform has its own transfer mechanism, so each has its own checklist and its own hold period. Pick yours to see how the handover works."
          />

          <ul className="mt-8 grid grid-cols-2 gap-3 sm:mt-10 sm:grid-cols-3 lg:grid-cols-5">
            {platforms.map((platform) => (
              <li key={platform.id}>
                <Link
                  href={`/browse/${platform.id}`}
                  className="lift-card group flex h-full flex-col gap-3 rounded-card border border-line bg-surface p-4 hover:border-line-strong sm:p-5"
                >
                  <span
                    className="flex size-10 items-center justify-center rounded-lg border border-line bg-surface-2"
                    style={{ color: platform.tint }}
                  >
                    <platform.icon className="size-5" />
                  </span>
                  <h3 className="text-[0.9375rem] font-semibold text-fg">
                    {platform.name}
                  </h3>
                  <p className="text-[0.8125rem] text-subtle">
                    <span className="tnum">{platform.holdDays}</span>-day hold
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                icon: LockIcon,
                title: "You are protected too",
                body: "A buyer cannot vanish mid-deal with your credentials. On a Fastest deal their money is with us before you start; on a Safest deal our agent holds the account, and it moves on only after you confirm the buyer's payment arrived.",
              },
              {
                icon: BadgeCheckIcon,
                title: "Reputation that follows you",
                body: "Every completed sale adds to a rating buyers can see. It is the reason a second sale is easier than the first.",
              },
              {
                icon: WalletIcon,
                title: "Paid in crypto",
                body: "A Fastest sale reaches your Channel Adda balance once our agent holds the account, and you withdraw it to your own crypto wallet through Cryptomus.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-card border border-line bg-surface p-5 sm:p-6"
              >
                <span className="flex size-9 items-center justify-center rounded-lg border border-line bg-surface-2 text-muted">
                  <item.icon aria-hidden="true" className="size-4.5" />
                </span>
                <h3 className="mt-4 text-[0.9375rem] font-semibold text-fg">
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
              <h2 className="text-xl font-semibold tracking-[-0.02em] sm:text-2xl">
                Ready to list?
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Creating an account takes about fifteen seconds and needs no
                documents. Identity checks only come in before your first
                listing goes live.
              </p>
            </div>
            <Button asChild size="lg" className="shrink-0">
              <Link href="/signup?next=%2Fdashboard%2Flistings%2Fnew">
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
      <dd className="tnum font-medium text-fg">{value}</dd>
    </div>
  );
}
