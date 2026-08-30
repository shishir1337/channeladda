import {
  FileCheck2Icon,
  FingerprintIcon,
  GavelIcon,
  MessagesSquareIcon,
  ScanEyeIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { Container, Section, SectionHeading } from "@/components/ui/section";

const safeguards = [
  {
    icon: FingerprintIcon,
    title: "KYC on every seller",
    body: "Government ID and liveness check before a seller can publish or withdraw. Repeat offenders are permanently banned by document hash.",
  },
  {
    icon: FileCheck2Icon,
    title: "Ownership code check",
    body: "Sellers drop a one-time Channel Adda code into the account bio or description. Our system reads it live — no screenshot can fake it.",
  },
  {
    icon: ScanEyeIcon,
    title: "Manual admin approval",
    body: "Analytics, monetization and revenue screenshots are reviewed by a human before the listing is visible to buyers.",
  },
  {
    icon: MessagesSquareIcon,
    title: "Order-linked chat",
    body: "Every message, offer and proof upload is attached to the order, so a dispute is judged on a real record instead of screenshots.",
  },
  {
    icon: GavelIcon,
    title: "Dispute resolution",
    body: "Open a dispute and escrow freezes instantly. Our moderation team reviews the log and either completes the handover or refunds in full.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Suspicious listing detection",
    body: "Automated checks flag recycled screenshots, engagement anomalies and pricing far outside the market band for that niche.",
  },
];

export function TrustSafety() {
  return (
    <Section
      id="trust"
      className="relative scroll-mt-24 overflow-hidden border-y border-line bg-bg-subtle"
    >
      <div
        aria-hidden="true"
        className="grid-backdrop pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_60%_60%_at_50%_0%,#000,transparent)]"
      />
      <Container className="relative">
        <SectionHeading
          eyebrow="Trust & safety"
          title="The boring machinery that keeps deals clean"
          description="Account trading has a scam problem. These are the specific controls we run so a Channel Adda deal is not a leap of faith."
          align="center"
        />

        <ul className="mt-10 grid gap-4 sm:mt-14 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          {safeguards.map((item) => (
            <li key={item.title}>
              <div className="lift-card group flex h-full flex-col rounded-card border border-line bg-surface p-5 hover:border-verified/45 sm:p-6">
                <span className="flex size-11 items-center justify-center rounded-xl bg-verified-soft text-verified transition-transform duration-300 ease-[var(--ease-out-soft)] group-hover:scale-105">
                  <item.icon aria-hidden="true" className="size-5" />
                </span>
                <h3 className="mt-5 font-display text-base font-semibold sm:text-lg">
                  {item.title}
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-muted">
                  {item.body}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-8 rounded-panel border border-line bg-surface p-6 sm:mt-10 sm:p-8">
          <dl className="grid gap-6 text-center sm:grid-cols-3 sm:text-left">
            {[
              { v: "99.4%", l: "Deals completed without a dispute" },
              { v: "< 48h", l: "Median dispute resolution time" },
              { v: "$0", l: "Buyer funds lost to a failed transfer" },
            ].map((stat) => (
              <div key={stat.l}>
                <dt className="sr-only">{stat.l}</dt>
                <dd>
                  <span className="tnum block font-sans text-3xl font-semibold text-primary-text">
                    {stat.v}
                  </span>
                  <span className="mt-1.5 block text-sm text-muted">
                    {stat.l}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </Container>
    </Section>
  );
}
