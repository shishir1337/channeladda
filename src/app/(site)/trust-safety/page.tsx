import { ScaleIcon, ShieldCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { TrustSafety } from "@/components/home/trust-safety";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Container, Section, SectionHeading } from "@/components/ui/section";

export const metadata: Metadata = {
  title: "Trust & safety",
  description:
    "KYC, live ownership verification, admin approval, order-linked chat and dispute resolution. The specific controls that make a Channel Adda deal safe.",
  alternates: { canonical: "/trust-safety" },
};

const disputeSteps = [
  {
    title: "You open the dispute",
    body: "One button on the deal page. The deal freezes where it stands, the account stays in our custody if it is there, and the money we hold for it stays with us: it is not in the seller's balance until the deal completes, so it cannot be withdrawn while the dispute is open.",
  },
  {
    title: "A moderator reads the record",
    body: "The whole conversation, every proof upload, the transfer checklist with timestamps, and a live check of who controls the account right now.",
  },
  {
    title: "A decision inside seven days",
    body: "Either the deal completes or it is reversed — the account goes on to the buyer, or back to the seller with the money. First response within 48 hours, and the outcome and the reasoning are written onto the deal.",
  },
];

export default function TrustSafetyPage() {
  return (
    <>
      <PageHeader
        crumbs={[{ label: "Home", href: "/" }, { label: "Trust & safety" }]}
        eyebrow="Trust & safety"
        title="The boring machinery that keeps deals clean"
        description="Account trading has a scam problem. Rather than promise you it is safe, here are the specific controls we run and what each one actually prevents."
      />

      <TrustSafety />

      <Section>
        <Container>
          <SectionHeading
            eyebrow="Disputes"
            title="What happens when a deal goes wrong"
            description="Most deals complete without incident. This is the process for the ones that do not."
          />

          <ol className="mt-9 grid gap-4 sm:mt-12 sm:grid-cols-3">
            {disputeSteps.map((step, i) => (
              <li key={step.title}>
                <div className="flex h-full flex-col rounded-card border border-line bg-surface p-5 sm:p-6">
                  <span className="tnum flex size-9 items-center justify-center rounded-full bg-primary-soft font-display text-sm font-bold text-primary-text">
                    {i + 1}
                  </span>
                  <h3 className="mt-4 font-display text-base font-semibold">
                    {step.title}
                  </h3>
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
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-16">
            <div>
              <h2 className="flex items-center gap-2.5 font-display text-xl font-bold sm:text-2xl">
                <ShieldCheckIcon
                  aria-hidden="true"
                  className="size-6 shrink-0 text-verified"
                />
                How to stay safe here
              </h2>
              <ul className="mt-5 flex flex-col gap-3.5 text-[0.9375rem] leading-relaxed text-muted">
                <li>
                  <span className="font-semibold text-fg">
                    Keep every message on Channel Adda.
                  </span>{" "}
                  A deal arranged on Telegram or WhatsApp has no custody, no
                  record and no dispute process. We cannot help with it.
                </li>
                <li>
                  <span className="font-semibold text-fg">
                    Never pay a seller before our agent holds the account.
                  </span>{" "}
                  On a Fastest deal you pay Channel Adda and nobody else. On a
                  Safest deal you pay the seller directly only once the deal
                  says our agent is primary owner, and only the way you agreed
                  in the deal chat. Anyone asking for money any other way is
                  running a scam, whatever their rating says.
                </li>
                <li>
                  <span className="font-semibold text-fg">
                    We will never ask for your password.
                  </span>{" "}
                  Not your password, not your two-factor codes, not your
                  recovery email. Anyone who does is not from Channel Adda.
                </li>
                <li>
                  <span className="font-semibold text-fg">
                    Work the checklist before confirming.
                  </span>{" "}
                  Confirming starts the clock on the seller getting paid. Change
                  the recovery email and phone first.
                </li>
              </ul>
            </div>

            <div className="rounded-panel border border-line bg-surface p-6 sm:p-8">
              <h2 className="flex items-center gap-2.5 font-display text-lg font-semibold">
                <ScaleIcon
                  aria-hidden="true"
                  className="size-5 shrink-0 text-primary-text"
                />
                Where we draw the line
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-muted">
                We refuse listings for accounts built on stolen content, hacked
                or recovered accounts, accounts with active strikes the seller
                has not disclosed, and any account whose audience was bought
                rather than earned.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Transferring an account is against the written terms of most
                platforms. We are open about that rather than pretending
                otherwise: it is why we verify ownership live, why the holding
                period is set platform by platform, and why a platform ban after
                completion is covered in our refund policy instead of being left
                to argue about.
              </p>
              <Button asChild variant="secondary" size="md" className="mt-6">
                <Link href="/listing-rules">Read the listing rules</Link>
              </Button>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
