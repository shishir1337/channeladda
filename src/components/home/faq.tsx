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
    <Section id="faq" className="scroll-mt-24 border-t border-line">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[22rem_1fr] lg:gap-16">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <h2 className="text-[1.625rem] leading-[1.15] font-semibold tracking-[-0.025em] sm:text-[2rem]">
              Questions buyers ask before their first deal
            </h2>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">
              Still unsure about something? A person on our support team will
              answer.
            </p>

            <div className="mt-6 rounded-card border border-line bg-surface p-5">
              <span className="flex size-9 items-center justify-center rounded-lg border border-line bg-surface-2 text-muted">
                <MessagesSquareIcon aria-hidden="true" className="size-4.5" />
              </span>
              <h3 className="mt-4 text-[0.9375rem] font-semibold text-fg">
                Talk to a human first
              </h3>
              <p className="mt-2 text-sm text-muted">
                We will walk you through a listing, the deal types and the fees
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

          <Accordion type="single" collapsible className="flex flex-col gap-2">
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
