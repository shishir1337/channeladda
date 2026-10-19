import {
  BanknoteIcon,
  CheckIcon,
  InfoIcon,
  LinkIcon,
  UsersIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Price } from "@/components/ui/price";
import { Container, Section, SectionHeading } from "@/components/ui/section";
import { quote } from "@/lib/fees";
import { supportHref } from "@/lib/support";
import { getFeeSettings } from "@/server/settings";

export const metadata: Metadata = {
  title: "Affiliate programme",
  description:
    "Earn 20% of the Channel Adda fee on every completed deal from buyers and sellers you refer, for twelve months. Paid in crypto. The programme is not open yet.",
  alternates: { canonical: "/affiliates" },
};

const steps = [
  {
    icon: LinkIcon,
    title: "Share your link",
    body: "Every affiliate gets a referral link. Put it in a video description, a newsletter, or a Telegram channel about buying and selling accounts.",
  },
  {
    icon: UsersIcon,
    title: "They sign up and deal",
    body: "The referral is attached to their account for twelve months, on both sides of the marketplace — buyers and sellers both count.",
  },
  {
    icon: BanknoteIcon,
    title: "You earn on completion",
    body: "You get 20% of the Channel Adda fee on every deal they complete. Nothing on a deal that falls through.",
  },
];

/**
 * Nothing tracks a referral yet — there is no link to hand out and no
 * dashboard to watch — so the page takes names rather than promising a link
 * on sign-up. The terms are the programme's; only the way in is honest now.
 */
const REGISTER = supportHref("The affiliate programme");

/** The sale the worked example is built on. */
const EXAMPLE_PRICE = 42_500;
const SHARE = 0.2;

export default async function AffiliatesPage() {
  // Read, not hardcoded. This was frozen at a combined 8% — a stale 3% + 5% —
  // which made the worked example 2.7 times the real figure, on the one page
  // whose whole purpose is that figure.
  const fees = await getFeeSettings();
  const q = quote(EXAMPLE_PRICE, fees, "FASTEST");
  const exampleFee = q.buyerFee + q.sellerFee;
  return (
    <>
      <PageHeader
        crumbs={[{ label: "Home", href: "/" }, { label: "Affiliates" }]}
        title="Get paid for sending us serious people"
        description="Twenty per cent of our fee on every completed deal from anyone you refer, for a full year. No cap, no tiers, no minimum volume."
        actions={
          <Button asChild size="lg">
            <Link href={REGISTER}>Register your interest</Link>
          </Button>
        }
      >
        <p className="mt-5 flex max-w-2xl items-start gap-2.5 rounded-card border border-info/20 bg-info-soft/70 px-4 py-3 text-sm leading-relaxed text-muted">
          <InfoIcon
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-info"
          />
          <span>
            <span className="font-medium text-fg">
              The programme is not open yet.
            </span>{" "}
            Register your interest and we will send your link when it opens.
          </span>
        </p>
      </PageHeader>

      <Section>
        <Container>
          <ol className="grid gap-3 sm:grid-cols-3">
            {steps.map((step, i) => (
              <li key={step.title}>
                <div className="flex h-full flex-col rounded-card border border-line bg-surface p-5 sm:p-6">
                  <span className="flex size-9 items-center justify-center rounded-lg border border-line bg-surface-2 text-muted">
                    <step.icon aria-hidden="true" className="size-4.5" />
                  </span>
                  <p className="tnum mt-4 text-[0.8125rem] font-medium text-subtle">
                    Step {i + 1}
                  </p>
                  <h2 className="mt-1 text-base font-semibold text-fg">
                    {step.title}
                  </h2>
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
                title="One referred sale, one real number"
                description={`A ${EXAMPLE_PRICE.toLocaleString("en-US")} channel sale on a Fastest deal earns Channel Adda ${exampleFee.toLocaleString("en-US")} in buyer and seller fees combined. Your share of that is ${SHARE * 100}%.`}
              />
              <ul className="mt-7 flex flex-col gap-2.5">
                {[
                  "Twelve-month attribution window",
                  "Both buyers and sellers count",
                  "Paid in crypto to your own wallet",
                ].map((point) => (
                  <li
                    key={point}
                    className="flex gap-2.5 text-sm leading-relaxed text-muted"
                  >
                    <CheckIcon
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-fg"
                    />
                    {point}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-8 rounded-panel border border-line bg-surface p-6 sm:p-8 lg:mt-0">
              <p className="text-[0.8125rem] font-medium text-subtle">
                Worked example
              </p>
              <dl className="mt-5 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted">Sale price</dt>
                  <dd className="font-medium">
                    <Price usd={42_500} />
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted">Channel Adda fee</dt>
                  <dd className="font-medium">
                    <Price usd={exampleFee} />
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-line pt-3 text-base font-semibold">
                  <dt>Your share (20%)</dt>
                  <dd className="tnum text-fg">
                    <Price usd={exampleFee * SHARE} />
                  </dd>
                </div>
              </dl>
              <p className="mt-4 border-t border-line pt-4 text-xs leading-relaxed text-subtle">
                Refer ten people who each complete one deal that size and that
                is{" "}
                <Price usd={exampleFee * SHARE * 10} className="text-muted" />{" "}
                in a year.
              </p>
            </div>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="rounded-panel border border-line bg-surface p-6 sm:p-8">
            <h2 className="text-base font-semibold text-fg">
              What we will not accept
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
              No paid search on our brand name, no cookie stuffing, and no
              promising outcomes we do not promise ourselves — particularly
              around monetization transferring with an account, which it does
              not. Referrals from anyone doing this are removed and unpaid.
            </p>
            <Button asChild size="lg" className="mt-6">
              <Link href={REGISTER}>Register your interest</Link>
            </Button>
          </div>
        </Container>
      </Section>
    </>
  );
}
