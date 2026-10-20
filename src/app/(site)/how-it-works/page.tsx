import { ShieldCheckIcon, TimerIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Faq } from "@/components/home/faq";
import { HowItWorks } from "@/components/home/how-it-works";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Container, Section, SectionHeading } from "@/components/ui/section";
import { platforms } from "@/data/platforms";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "Both deal types, the handover checklist and the holding period explained. How Channel Adda moves money and account ownership without either side taking a leap of faith.",
  alternates: { canonical: "/how-it-works" },
};

export default function HowItWorksPage() {
  return (
    <>
      <PageHeader
        crumbs={[{ label: "Home", href: "/" }, { label: "How it works" }]}
        title="Nobody goes first on trust"
        description="The oldest problem in account trading is that someone has to move first — hand over the login, or hand over the money. We take one side of the exchange and hold it, so neither of you has to."
      />

      <HowItWorks />

      <Section className="border-y border-line bg-bg-subtle">
        <Container>
          <SectionHeading
            title="Why the wait is different on every platform"
            description="On a Fastest deal our agent takes the account from the seller and you are invited as owner for the whole holding period. Then our agent becomes primary owner, the seller is paid, and our agent makes you primary owner. On YouTube it is Google's own 7-day wait before a new owner can be made primary owner."
          />

          <div className="mt-8 overflow-x-auto rounded-card border border-line bg-surface sm:mt-10">
            <table className="w-full min-w-[44rem] text-sm">
              <caption className="sr-only">
                Hold period and transfer mechanism by platform
              </caption>
              <thead>
                <tr className="border-b border-line bg-surface-2">
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-[0.8125rem] font-medium text-subtle"
                  >
                    Platform
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-[0.8125rem] font-medium text-subtle"
                  >
                    How ownership moves
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-[0.8125rem] font-medium text-subtle"
                  >
                    Hold
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...platforms]
                  .sort((a, b) => a.holdDays - b.holdDays)
                  .map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-line last:border-b-0"
                    >
                      <th scope="row" className="px-4 py-4 text-left align-top">
                        <span className="flex items-center gap-2.5 font-semibold">
                          <span style={{ color: p.tint }}>
                            <p.icon className="size-4" />
                          </span>
                          {p.name}
                        </span>
                      </th>
                      <td className="px-4 py-4 align-top leading-relaxed text-muted">
                        {p.transferNote}
                      </td>
                      <td className="px-4 py-4 align-top">
                        <span className="tnum inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-fg">
                          <TimerIcon aria-hidden="true" className="size-3.5" />
                          {p.holdDays} days
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <p className="mt-5 flex items-start gap-2.5 text-sm leading-relaxed text-muted">
            <ShieldCheckIcon
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-verified"
            />
            <span>
              If anything goes wrong inside that window on a Fastest deal, you
              open a dispute and it is decided on the record — your money is
              still with us.
            </span>
          </p>
        </Container>
      </Section>

      <Faq />

      <Section>
        <Container>
          <div className="flex flex-col items-start gap-4 rounded-panel border border-line bg-surface p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div className="max-w-lg">
              <h2 className="text-xl font-semibold tracking-[-0.02em] sm:text-2xl">
                Still have a question?
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Write to us and a person on our support team will answer.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/browse">Browse accounts</Link>
              </Button>
              <Button asChild variant="secondary" size="lg">
                <Link href="/support">Contact support</Link>
              </Button>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
