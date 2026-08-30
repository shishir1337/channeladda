import { ArrowRightIcon, CheckIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Container, Section } from "@/components/ui/section";

const sellerSteps = [
  {
    step: "01",
    title: "Publish your listing",
    body: "Add the handle, metrics and asking price. Free, and it takes about ten minutes.",
  },
  {
    step: "02",
    title: "Verify ownership",
    body: "Drop our one-time code in your bio or description. The check is instant.",
  },
  {
    step: "03",
    title: "Get paid in crypto",
    body: "Once the buyer confirms the handover, escrow releases to your Cryptomus wallet.",
  },
];

export function SellerCta() {
  return (
    <Section id="sell" className="scroll-mt-24">
      <Container>
        <div className="relative overflow-hidden rounded-panel border border-line bg-surface p-6 sm:p-10 lg:p-14">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
          >
            <div className="grid-backdrop absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_80%_70%_at_20%_0%,#000,transparent)]" />
            <div className="absolute -top-24 -right-16 h-80 w-80 rounded-full bg-primary/18 blur-[90px]" />
          </div>

          <div className="relative grid gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <p className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-primary-text uppercase">
                <span aria-hidden="true" className="h-px w-6 bg-primary/50" />
                For sellers
              </p>
              <h2 className="text-[1.75rem] leading-[1.15] font-bold sm:text-4xl lg:text-[2.75rem]">
                Your channel is an asset. Cash it out safely.
              </h2>
              <p className="mt-5 max-w-lg text-[0.9375rem] leading-relaxed text-muted sm:text-base">
                List for free, put your account in front of active buyers, and
                let escrow prove you are serious. No listing fee — we only earn
                when your deal completes.
              </p>

              <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2.5">
                {[
                  "Free to list",
                  "No exclusivity",
                  "Payout in under 1 hour",
                ].map((point) => (
                  <li
                    key={point}
                    className="inline-flex items-center gap-2 text-sm text-muted"
                  >
                    <CheckIcon
                      aria-hidden="true"
                      className="size-4 shrink-0 text-verified"
                    />
                    {point}
                  </li>
                ))}
              </ul>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="w-full sm:w-auto">
                  <Link href="/sell">
                    Create a free listing
                    <ArrowRightIcon aria-hidden="true" className="size-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="w-full sm:w-auto"
                >
                  <Link href="/fees">See seller fees</Link>
                </Button>
              </div>
            </div>

            <ol className="flex flex-col gap-3 lg:gap-4">
              {sellerSteps.map((item) => (
                <li
                  key={item.step}
                  className="flex gap-4 rounded-card border border-line bg-bg/70 p-5 backdrop-blur-sm"
                >
                  <span className="tnum shrink-0 font-display text-sm font-bold text-primary-text">
                    {item.step}
                  </span>
                  <div>
                    <h3 className="font-display text-base font-semibold">
                      {item.title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">
                      {item.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Container>
    </Section>
  );
}
