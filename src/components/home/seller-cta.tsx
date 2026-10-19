import { ArrowRightIcon, CheckIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Container, Section } from "@/components/ui/section";

const sellerSteps = [
  {
    step: "1",
    title: "Publish your listing",
    body: "Add the handle, metrics and asking price. Free, and it takes about ten minutes.",
  },
  {
    step: "2",
    title: "Verify ownership",
    body: "Drop our one-time code in your bio or description. On YouTube we read it live; elsewhere a moderator checks the account.",
  },
  {
    step: "3",
    title: "Get paid, either way",
    body: "On a Fastest deal the money lands in your Channel Adda wallet once the buyer is primary owner, and you withdraw it to your own crypto wallet. On a Safest deal the buyer pays you directly once our agent holds the account — and it moves to them only after you confirm the money arrived.",
  },
];

export function SellerCta() {
  return (
    <Section id="sell" className="scroll-mt-24">
      <Container>
        <div className="rounded-panel border border-line bg-surface p-6 sm:p-10 lg:p-12">
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <h2 className="text-[1.625rem] leading-[1.15] font-semibold tracking-[-0.025em] sm:text-[2rem]">
                Your channel is an asset. Cash it out safely.
              </h2>
              <p className="mt-4 max-w-lg text-[0.9375rem] leading-relaxed text-muted sm:text-base">
                List for free, put your account in front of active buyers, and
                let a supervised handover prove you are serious. No listing fee
                — we earn a fee on deals, never on listings.
              </p>

              <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2.5">
                {[
                  "Free to list",
                  "No exclusivity",
                  "Paid when the deal completes",
                ].map((point) => (
                  <li
                    key={point}
                    className="inline-flex items-center gap-2 text-sm text-muted"
                  >
                    <CheckIcon
                      aria-hidden="true"
                      className="size-4 shrink-0 text-fg"
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
                  variant="secondary"
                  size="lg"
                  className="w-full sm:w-auto"
                >
                  <Link href="/fees">See seller fees</Link>
                </Button>
              </div>
            </div>

            <ol className="flex flex-col gap-3">
              {sellerSteps.map((item) => (
                <li
                  key={item.step}
                  className="flex gap-4 rounded-card border border-line bg-bg p-5"
                >
                  <span className="tnum flex size-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-[0.8125rem] font-semibold text-fg">
                    {item.step}
                  </span>
                  <div>
                    <h3 className="text-[0.9375rem] font-semibold text-fg">
                      {item.title}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted">
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
