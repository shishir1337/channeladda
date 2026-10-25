import {
  FileCheck2Icon,
  FingerprintIcon,
  GavelIcon,
  MessagesSquareIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { Container, Section, SectionHeading } from "@/components/ui/section";

// One short line each. "Manual admin approval" went: a YouTube channel
// whose ownership code is found now goes live with no moderator.
const safeguards = [
  {
    icon: FingerprintIcon,
    title: "A badge for checked IDs",
    body: "Verified means our team checked their ID.",
  },
  {
    icon: FileCheck2Icon,
    title: "Ownership is checked",
    body: "The seller proves it is theirs with a code on the live account.",
  },
  {
    icon: MessagesSquareIcon,
    title: "Everything is on record",
    body: "Messages, offers and proof stay with the deal.",
  },
  {
    icon: GavelIcon,
    title: "Problems go to people",
    body: "The deal pauses and our team decides.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Odd listings are flagged",
    body: "Re-used screenshots and strange prices are caught.",
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
            title="How we keep deals safe"
            description="The checks behind every deal."
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
              {/* A row each on a phone; cards from a tablet up. */}
              <div className="flex h-full items-center gap-3.5 rounded-card border border-line bg-surface p-4 sm:flex-col sm:items-start sm:p-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-verified-soft text-verified">
                  <item.icon aria-hidden="true" className="size-4.5" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[0.9375rem] font-semibold text-fg sm:text-base">
                    {item.title}
                  </h3>
                  <p className="mt-0.5 text-sm text-muted sm:mt-1.5">
                    {item.body}
                  </p>
                </div>
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
              { v: "2", l: "Ways to buy: we hold the money, or the channel" },
              { v: "1", l: "Agent on every deal" },
              { v: "0", l: "Deals where you have to trust a stranger" },
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
