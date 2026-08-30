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

const steps = [
  {
    icon: SearchCheckIcon,
    title: "Find and agree",
    body: "Filter by platform, niche, country and revenue. Send an offer or counter-offer inside Channel Adda chat until both sides agree.",
  },
  {
    icon: LockIcon,
    title: "Pay into escrow",
    body: "Your crypto payment goes to Channel Adda, not the seller. The seller sees the funds are secured and starts the transfer.",
  },
  {
    icon: HandshakeIcon,
    title: "Supervised handover",
    body: "Credentials, recovery email and 2FA move across with an agent watching the order-linked chat and proof uploads.",
  },
  {
    icon: BanknoteIcon,
    title: "You confirm, seller gets paid",
    body: "Funds release only when you confirm full control. If the handover fails, escrow refunds you in full.",
  },
];

const modes = [
  {
    id: "quick",
    icon: ZapIcon,
    name: "Quick checkout",
    tagline: "For small, instantly transferable accounts",
    fee: "3%",
    release: "Immediately",
    accent: false,
    points: [
      "Credentials released the moment payment clears",
      "Best for listings under $1,000",
      "24-hour buyer protection window",
      "Ownership code still verified before listing",
    ],
  },
  {
    id: "safest",
    icon: LockIcon,
    name: "Safest escrow",
    tagline: "Our default for every serious deal",
    fee: "3%",
    release: "After you confirm",
    accent: true,
    points: [
      "Funds held until you confirm the handover",
      "7-day ownership window before payout",
      "Recovery email and 2FA reset supervised by an agent",
      "Full refund and dispute review if anything breaks",
    ],
  },
];

export function HowItWorks() {
  return (
    <Section id="how-it-works" className="scroll-mt-24">
      <Container>
        <SectionHeading
          eyebrow="How it works"
          title="Four steps, and your money never moves early"
          description="The same flow runs on a $200 Telegram channel and a $74,000 YouTube channel. Only the checks get deeper."
          align="center"
        />

        <ol className="mt-10 grid gap-4 sm:mt-14 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
          {steps.map((step, index) => (
            <li key={step.title} className="relative">
              {/* Connector runs between cards on the 4-across layout only. */}
              {index < steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="absolute top-[3.4rem] -right-5 hidden h-px w-5 bg-line lg:block"
                />
              ) : null}
              <div className="flex h-full flex-col rounded-card border border-line bg-surface p-5 transition-colors duration-300 hover:border-primary/40 sm:p-6">
                <div className="flex items-center justify-between">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary-text">
                    <step.icon aria-hidden="true" className="size-5" />
                  </span>
                  <span className="tnum text-2xl font-semibold text-line-strong">
                    0{index + 1}
                  </span>
                </div>
                <h3 className="mt-5 font-display text-lg font-semibold">
                  {step.title}
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-muted">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-12 sm:mt-16">
          <div className="mx-auto max-w-2xl text-center">
            <h3 className="font-display text-xl font-bold sm:text-2xl">
              Two ways to close a deal
            </h3>
            <p className="mt-3 text-[0.9375rem] text-muted">
              Anything above $1,000 is routed to Safest escrow automatically.
            </p>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-2 lg:gap-5">
            {modes.map((mode) => (
              <div
                key={mode.id}
                className={
                  mode.accent
                    ? "relative rounded-panel border-2 border-primary bg-surface p-6 shadow-lift sm:p-8"
                    : "relative rounded-panel border border-line bg-surface p-6 sm:p-8"
                }
              >
                {mode.accent ? (
                  <Badge
                    variant="solid"
                    size="md"
                    className="absolute -top-3 left-6 shadow-soft"
                  >
                    Recommended
                  </Badge>
                ) : null}

                <div className="flex items-start gap-3">
                  <span
                    className={
                      mode.accent
                        ? "flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-fg"
                        : "flex size-12 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted"
                    }
                  >
                    <mode.icon aria-hidden="true" className="size-5" />
                  </span>
                  <div>
                    <h4 className="font-display text-lg font-semibold">
                      {mode.name}
                    </h4>
                    <p className="mt-1 text-sm text-muted">{mode.tagline}</p>
                  </div>
                </div>

                {/* Fee is identical across modes — what actually differs is
                    when the seller gets the money, so both are shown. */}
                <dl className="mt-5 grid grid-cols-2 gap-4 border-y border-line py-4">
                  <div>
                    <dt className="text-[0.6875rem] tracking-wide text-subtle uppercase">
                      Platform fee
                    </dt>
                    <dd className="tnum mt-1.5 font-sans text-base font-semibold">
                      {mode.fee}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[0.6875rem] tracking-wide text-subtle uppercase">
                      Seller paid
                    </dt>
                    <dd
                      className={
                        mode.accent
                          ? "mt-1.5 text-base font-semibold text-verified"
                          : "mt-1.5 text-base font-semibold"
                      }
                    >
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
                    {mode.accent
                      ? "Start a protected deal"
                      : "See quick listings"}
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
