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
    body: "Sellers drop a one-time Channel Adda code into the account bio or description. On YouTube we read the live channel and check it ourselves; everywhere else a moderator opens the account and looks. Either way it is the live account, not a screenshot.",
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
    body: "Open a dispute and the deal freezes where it stands. Our moderation team reads the whole record and decides it — the account goes on to the buyer or back to the seller, and on a Fastest deal the money follows.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Suspicious listing detection",
    body: "Automated checks flag recycled screenshots, engagement anomalies and pricing far outside the market band for that niche.",
  },
];

/**
 * The safeguards. On the home page it is the one band and carries its own
 * heading; on the trust and safety page, whose title already says this, it
 * sits under that title instead of repeating it.
 */
export function TrustSafety({ embedded = false }: { embedded?: boolean }) {
  return (
    <Section
      id="trust"
      className={
        embedded
          ? "scroll-mt-24"
          : "scroll-mt-24 border-y border-line bg-bg-subtle py-14 sm:py-20 lg:py-24"
      }
    >
      <Container>
        {embedded ? null : (
          <SectionHeading
            title="The boring machinery that keeps deals clean"
            description="Account trading has a scam problem. These are the specific controls we run so a Channel Adda deal is not a leap of faith."
            align="center"
          />
        )}

        <ul
          className={
            embedded
              ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
              : "mt-8 grid gap-3 sm:mt-10 sm:grid-cols-2 lg:grid-cols-3"
          }
        >
          {safeguards.map((item) => (
            <li key={item.title}>
              <div className="flex h-full flex-col rounded-card border border-line bg-surface p-5">
                <span className="flex size-9 items-center justify-center rounded-lg border border-line bg-surface-2 text-muted">
                  <item.icon aria-hidden="true" className="size-4.5" />
                </span>
                <h3 className="mt-4 text-base font-semibold text-fg">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {item.body}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-3 rounded-card border border-line bg-surface p-6 sm:p-7">
          <dl className="grid gap-6 text-center sm:grid-cols-3 sm:text-left">
            {/* Facts about how the product is built, which are checkable
                from the product itself. The figures that used to sit here
                were measurements nobody had taken. */}
            {[
              { v: "2", l: "Deal types — we hold the money, or the account" },
              { v: "1", l: "Agent on every deal, named before it starts" },
              { v: "0", l: "Deals where both sides are exposed at once" },
            ].map((stat) => (
              <div key={stat.l}>
                <dt className="sr-only">{stat.l}</dt>
                <dd>
                  <span className="tnum block text-3xl font-semibold tracking-[-0.02em] text-fg">
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
