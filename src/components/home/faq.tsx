import { MessagesSquareIcon } from "lucide-react";
import Link from "next/link";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Container, Section } from "@/components/ui/section";
import { faqs } from "@/data/site";

export function Faq() {
  return (
    <Section
      id="faq"
      className="scroll-mt-24 border-t border-line bg-bg-subtle"
    >
      <Container>
        <div className="grid gap-10 lg:grid-cols-[22rem_1fr] lg:gap-16">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-primary-text uppercase">
              <span aria-hidden="true" className="h-px w-6 bg-primary/50" />
              FAQ
            </p>
            <h2 className="text-[1.75rem] leading-[1.15] font-bold sm:text-4xl">
              Questions buyers ask before their first deal
            </h2>
            <p className="mt-4 text-[0.9375rem] leading-relaxed text-muted">
              Still unsure about something? Support answers in under 10 minutes,
              around the clock.
            </p>

            <div className="mt-7 rounded-card border border-line bg-surface p-5">
              <span className="flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary-text">
                <MessagesSquareIcon aria-hidden="true" className="size-5" />
              </span>
              <h3 className="mt-4 font-display text-base font-semibold">
                Talk to a human first
              </h3>
              <p className="mt-2 text-sm text-muted">
                We will walk you through a listing, the escrow flow and the fees
                before you commit anything.
              </p>
              <Button
                asChild
                variant="secondary"
                size="sm"
                className="mt-5 w-full"
              >
                <Link href="/support">Contact support</Link>
              </Button>
            </div>
          </div>

          <Accordion type="single" collapsible className="flex flex-col gap-3">
            {faqs.map((faq, index) => (
              <AccordionItem key={faq.q} value={`item-${index}`}>
                <AccordionTrigger>{faq.q}</AccordionTrigger>
                <AccordionContent>{faq.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </Container>
    </Section>
  );
}
