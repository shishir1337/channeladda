import type { ReactNode } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

/**
 * Questions folded shut, one open at a time — the homepage's, for the pages
 * written for search. Folded so the page stays short on a phone; the
 * answers are in the page all the same, for search engines to read.
 */
export function FaqList({
  items,
  className,
}: {
  items: { question: string; answer: ReactNode }[];
  className?: string;
}) {
  return (
    <Accordion
      type="single"
      collapsible
      className={cn("flex flex-col gap-2", className)}
    >
      {items.map((item, index) => (
        <AccordionItem key={item.question} value={`item-${index}`}>
          <AccordionTrigger>{item.question}</AccordionTrigger>
          <AccordionContent>{item.answer}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
