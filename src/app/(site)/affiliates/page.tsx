import { BanknoteIcon, CheckIcon, LinkIcon, UsersIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Price } from "@/components/ui/price";
import { Container, Section, SectionHeading } from "@/components/ui/section";

export const metadata: Metadata = {
  title: "Affiliate programme",
  description:
    "Earn 20% of the Channel Adda fee on every completed deal from buyers and sellers you refer, for twelve months. Paid in crypto, tracked on the order.",
  alternates: { canonical: "/affiliates" },
};

const steps = [
  {
    icon: LinkIcon,
    title: "Share your link",
    body: "Every account gets a referral link. Put it in a video description, a newsletter, or a Telegram channel about buying and selling accounts.",
  },
  {
    icon: UsersIcon,
    title: "They sign up and deal",
    body: "The referral is attached to their account for twelve months, on both sides of the marketplace — buyers and sellers both count.",
  },
  {
    icon: BanknoteIcon,
    title: "You earn on completion",
    body: "You get 20% of the Channel Adda fee on every deal they complete. Nothing on a deal that falls through, same as us.",
  },
];

/** A real number beats a percentage — this is the fee on a $42,500 sale. */
const EXAMPLE_FEE = 3_400;

export default function AffiliatesPage() {
  return (
    <>
      <PageHeader
        crumbs={[{ label: "Home", href: "/" }, { label: "Affiliates" }]}
        eyebrow="Affiliate programme"
        title="Get paid for sending us serious people"
        description="Twenty per cent of our fee on every completed deal from anyone you refer, for a full year. No cap, no tiers, no minimum volume."
        actions={
          <Button asChild size="lg">
            <Link href="/signup">Get your link</Link>
          </Button>
        }
      />

      <Section>
        <Container>
          <ol className="grid gap-4 sm:grid-cols-3">
            {steps.map((step, i) => (
              <li key={step.title}>
                <div className="flex h-full flex-col rounded-card border border-line bg-surface p-5 sm:p-6">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary-text">
                    <step.icon aria-hidden="true" className="size-5" />
                  </span>
                  <p className="tnum mt-4 font-display text-xs font-bold text-subtle">
                    STEP 0{i + 1}
                  </p>
                  <h2 className="mt-1 font-display text-base font-semibold">
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
                eyebrow="What it pays"
                title="One referred sale, one real number"
                description="A $42,500 channel sale earns Channel Adda $3,400 in combined buyer and seller fees. Your share of that is 20%."
              />
              <ul className="mt-7 flex flex-col gap-2.5">
                {[
                  "Twelve-month attribution window",
                  "Both buyers and sellers count",
                  "Paid in crypto to your own wallet",
                  "Live dashboard of referred deals",
                ].map((point) => (
                  <li
                    key={point}
                    className="flex gap-2.5 text-sm leading-relaxed text-muted"
                  >
                    <CheckIcon
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-verified"
                    />
                    {point}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-8 rounded-panel border border-line bg-surface p-6 shadow-soft sm:p-8 lg:mt-0">
              <p className="text-xs font-semibold tracking-[0.14em] text-subtle uppercase">
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
                    <Price usd={EXAMPLE_FEE} />
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-line pt-3 text-base font-semibold">
                  <dt>Your share (20%)</dt>
                  <dd className="text-verified">
                    <Price usd={EXAMPLE_FEE * 0.2} />
                  </dd>
                </div>
              </dl>
              <p className="mt-4 border-t border-line pt-4 text-xs leading-relaxed text-subtle">
                Refer ten people who each complete one deal that size and that
                is <Price usd={EXAMPLE_FEE * 0.2 * 10} className="text-muted" />{" "}
                in a year.
              </p>
            </div>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="rounded-panel border border-line bg-surface p-6 sm:p-8">
            <h2 className="font-display text-lg font-semibold">
              What we will not accept
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
              No paid search on our brand name, no cookie stuffing, and no
              promising outcomes we do not promise ourselves — particularly
              around monetization transferring with an account, which it does
              not. Referrals from anyone doing this are removed and unpaid.
            </p>
            <Button asChild size="lg" className="mt-6">
              <Link href="/signup">Join the programme</Link>
            </Button>
          </div>
        </Container>
      </Section>
    </>
  );
}
