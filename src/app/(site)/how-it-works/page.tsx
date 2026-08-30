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
    "Escrow, the handover checklist and the cooling-off period explained. How Channel Adda moves money and account ownership without either side taking a leap of faith.",
  alternates: { canonical: "/how-it-works" },
};

export default function HowItWorksPage() {
  return (
    <>
      <PageHeader
        crumbs={[{ label: "Home", href: "/" }, { label: "How it works" }]}
        eyebrow="The process"
        title="Nobody goes first on trust"
        description="The oldest problem in account trading is that someone has to move first — hand over the login, or hand over the money. Escrow removes the question entirely."
      />

      <HowItWorks />

      <Section className="border-y border-line bg-bg-subtle">
        <Container>
          <SectionHeading
            eyebrow="Cooling-off"
            title="Why the wait is different on every platform"
            description="The hold is not a policy we invented for comfort. It is set by how long each platform actually lets a previous owner take an account back."
          />

          <div className="mt-9 overflow-x-auto rounded-card border border-line bg-surface sm:mt-12">
            <table className="w-full min-w-[44rem] text-sm">
              <caption className="sr-only">
                Escrow hold period and transfer mechanism by platform
              </caption>
              <thead>
                <tr className="border-b border-line bg-surface-2">
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-[0.6875rem] font-medium tracking-wide text-subtle uppercase"
                  >
                    Platform
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-[0.6875rem] font-medium tracking-wide text-subtle uppercase"
                  >
                    How ownership moves
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-[0.6875rem] font-medium tracking-wide text-subtle uppercase"
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
                        <span className="tnum inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs font-semibold whitespace-nowrap">
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
              If the previous owner recovers the account inside that window, you
              reopen the dispute and are refunded in full.
            </span>
          </p>
        </Container>
      </Section>

      <Faq />

      <Section>
        <Container>
          <div className="flex flex-col items-start gap-4 rounded-panel border border-line bg-surface p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div className="max-w-lg">
              <h2 className="font-display text-xl font-bold sm:text-2xl">
                Still have a question?
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Support replies in under ten minutes, every day of the year.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/browse">Browse accounts</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/support">Contact support</Link>
              </Button>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
