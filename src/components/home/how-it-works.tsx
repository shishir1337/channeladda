import {
  ArrowRightIcon,
  BanknoteIcon,
  CheckIcon,
  HandshakeIcon,
  LockIcon,
  SearchCheckIcon,
  ZapIcon,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { iconTile } from "@/components/ui/icon-hue";
import { Container, Section, SectionHeading } from "@/components/ui/section";
import { formatRate } from "@/lib/fees";
import { getFeeSettings } from "@/server/settings";

// One short line each: the owner's clients read this on a phone, and four
// paragraph cards were most of a screen before anything happened.
const steps = [
  {
    icon: SearchCheckIcon,
    title: "Find an account",
    body: "Search, ask the seller, make an offer.",
  },
  {
    icon: LockIcon,
    title: "Choose Safest or Fastest",
    body: "We hold the account or your money.",
  },
  {
    icon: HandshakeIcon,
    title: "Our agent hands it over",
    body: "You see every step in the deal chat.",
  },
  {
    icon: BanknoteIcon,
    title: "It is yours",
    body: "The deal closes when the account is yours.",
  },
];

const modes = [
  {
    id: "fastest",
    icon: ZapIcon,
    name: "Fastest",
    tagline: "You pay us, we pay the seller",
    release: "When our agent has the account",
    accent: false,
    points: [
      "We hold your money until our agent has the account",
      "Then our agent makes you primary owner",
      "The seller never hands it straight to a stranger",
    ],
  },
  {
    id: "safest",
    icon: LockIcon,
    name: "Safest",
    tagline: "We hold the account first",
    release: "By you, after our agent has it",
    accent: true,
    points: [
      "Our agent takes the account before you pay the seller",
      "You pay us only our fee",
      "The seller confirms your payment, then the account is yours",
    ],
  },
];

export async function HowItWorks() {
  // Read, not hardcoded: a superadmin changing the rate in /admin/settings
  // used to leave the home page quoting the old one.
  const fees = await getFeeSettings();
  const rateFor = (id: string) =>
    `${formatRate(
      id === "safest" ? fees.buyerFeeBpSafest : fees.buyerFeeBpFastest,
    )}%`;

  return (
    <Section id="how-it-works" className="scroll-mt-24">
      <Container>
        <SectionHeading
          title="How it works"
          description="Four simple steps, for every deal."
          align="center"
        />

        {/* A row each on a phone, cards side by side from a tablet up. */}
        <ol className="mt-8 grid gap-2.5 sm:mt-10 sm:grid-cols-2 sm:gap-3 lg:grid-cols-4">
          {steps.map((step, index) => (
            <li
              key={step.title}
              className="flex items-center gap-3.5 rounded-card border border-line bg-surface p-4 sm:flex-col sm:items-start sm:p-5"
            >
              <span className="relative flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-text">
                <step.icon aria-hidden="true" className="size-4.5" />
                <span className="tnum absolute -top-1.5 -right-1.5 inline-flex size-5 items-center justify-center rounded-full bg-primary text-[0.6875rem] font-bold text-primary-fg ring-2 ring-surface">
                  {index + 1}
                </span>
              </span>
              <div className="min-w-0">
                <h3 className="text-[0.9375rem] font-semibold text-fg sm:text-base">
                  {step.title}
                </h3>
                <p className="mt-0.5 text-sm text-muted sm:mt-1.5">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-14 sm:mt-20">
          <div className="mx-auto max-w-2xl text-center">
            <h3 className="text-xl font-semibold tracking-[-0.02em] sm:text-2xl">
              Two ways to buy
            </h3>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            {modes.map((mode) => (
              <div
                key={mode.id}
                // The recommended one is marked by its edge and its tag,
                // not by a glow: it is a choice, not an advert.
                className={
                  mode.accent
                    ? "relative rounded-panel border border-primary/60 bg-surface p-6 ring-1 ring-primary/20 sm:p-7"
                    : "relative rounded-panel border border-line bg-surface p-6 sm:p-7"
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span
                      className={`flex size-10 shrink-0 items-center justify-center rounded-lg border ${iconTile(mode.icon)}`}
                    >
                      <mode.icon aria-hidden="true" className="size-4.5" />
                    </span>
                    <div>
                      <h4 className="text-lg font-semibold text-fg">
                        {mode.name}
                      </h4>
                      <p className="mt-0.5 text-sm text-muted">
                        {mode.tagline}
                      </p>
                    </div>
                  </div>
                  {mode.accent ? (
                    <Badge variant="primary" size="md">
                      Recommended
                    </Badge>
                  ) : null}
                </div>

                {/* The two modes may be priced differently: Fastest carries
                    the money and is more work, so it has its own rate. */}
                <dl className="mt-5 grid grid-cols-2 gap-4 border-y border-line py-4">
                  <div>
                    <dt className="text-[0.8125rem] text-subtle">Our fee</dt>
                    <dd className="tnum mt-1 text-base font-semibold text-fg">
                      {rateFor(mode.id)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[0.8125rem] text-subtle">
                      Seller is paid
                    </dt>
                    <dd className="mt-1 text-base font-semibold text-fg">
                      {mode.release}
                    </dd>
                  </div>
                </dl>

                <ul className="mt-5 space-y-3">
                  {mode.points.map((point) => (
                    <li key={point} className="flex gap-2.5 text-sm text-muted">
                      <CheckIcon
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-verified"
                      />
                      {point}
                    </li>
                  ))}
                </ul>

                <Button
                  asChild
                  variant={mode.accent ? "primary" : "secondary"}
                  size="md"
                  className="mt-7 w-full"
                >
                  <Link href="/browse">
                    {mode.accent ? "Start a protected deal" : "Browse accounts"}
                    <ArrowRightIcon aria-hidden="true" className="size-4" />
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </Section>
  );
}
