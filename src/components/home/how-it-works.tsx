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
import { Container, Section, SectionHeading } from "@/components/ui/section";
import { formatRate } from "@/lib/fees";
import { getFeeSettings } from "@/server/settings";

const steps = [
  {
    icon: SearchCheckIcon,
    title: "Find and agree",
    body: "Filter by platform, niche, country and revenue. Send an offer or counter-offer inside Channel Adda chat until both sides agree.",
  },
  {
    icon: LockIcon,
    title: "Choose how to pay",
    body: "Fastest: your crypto payment goes to Channel Adda, not the seller, and the seller starts the transfer knowing it is secured. Safest: you pay our fee, an agent takes the account into our hands, and only then do you pay the seller directly.",
  },
  {
    icon: HandshakeIcon,
    title: "Supervised handover",
    body: "Credentials, recovery email and 2FA move across with an agent watching the order-linked chat and proof uploads.",
  },
  {
    icon: BanknoteIcon,
    title: "You confirm, the deal closes",
    body: "On a Fastest deal we hold the money and pay the seller once you are primary owner. On a Safest deal our agent holds the account, and makes you the owner once the seller confirms your payment arrived.",
  },
];

const modes = [
  {
    id: "fastest",
    icon: ZapIcon,
    name: "Fastest",
    tagline: "The account comes straight to you",
    release: "When you are primary owner",
    accent: false,
    points: [
      "We hold your money until you are the account's primary owner",
      "You are a manager through the holding period, then primary owner",
      "The seller transfers the account to you directly, with an agent watching",
      "Ownership code verified before the listing goes up",
    ],
  },
  {
    id: "safest",
    icon: LockIcon,
    name: "Safest",
    tagline: "Our default for every serious deal",
    release: "By you, once we hold the account",
    accent: true,
    points: [
      "Our agent holds the account before you pay the seller anything",
      "You pay us only our fee; the price goes to the seller directly",
      "The seller confirms your payment before the account moves to you",
      "If it breaks before our agent takes the channel, we refund our fee",
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
          title="Four steps, and your money never moves early"
          description="The same flow runs on a $200 Telegram channel and a $74,000 YouTube channel. Only the checks get deeper."
          align="center"
        />

        <ol className="mt-8 grid gap-3 sm:mt-10 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <li
              key={step.title}
              className="flex flex-col rounded-card border border-line bg-surface p-5"
            >
              <div className="flex items-center justify-between">
                <span className="flex size-9 items-center justify-center rounded-lg border border-line bg-surface-2 text-muted">
                  <step.icon aria-hidden="true" className="size-4.5" />
                </span>
                <span className="tnum text-[0.8125rem] font-medium text-subtle">
                  Step {index + 1}
                </span>
              </div>
              <h3 className="mt-4 text-base font-semibold text-fg">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {step.body}
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-14 sm:mt-20">
          <div className="mx-auto max-w-2xl text-center">
            <h3 className="text-xl font-semibold tracking-[-0.02em] sm:text-2xl">
              Two ways to close a deal
            </h3>
            <p className="mt-2 text-[0.9375rem] text-muted">
              Which one you use is your choice on every listing.
            </p>
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
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-muted">
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
                    <dt className="text-[0.8125rem] text-subtle">
                      Platform fee
                    </dt>
                    <dd className="tnum mt-1 text-base font-semibold text-fg">
                      {rateFor(mode.id)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[0.8125rem] text-subtle">
                      Seller paid
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
                        className="mt-0.5 size-4 shrink-0 text-fg"
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
