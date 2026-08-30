"use client";

import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { PlusIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const Accordion = AccordionPrimitive.Root;

export function AccordionItem({
  className,
  ...props
}: ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      className={cn(
        "overflow-hidden rounded-card border border-line bg-surface transition-colors duration-200 data-[state=open]:border-primary/40",
        className,
      )}
      {...props}
    />
  );
}

export function AccordionTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        className={cn(
          "group flex flex-1 cursor-pointer items-center justify-between gap-4 px-5 py-5 text-left text-[0.9375rem] font-semibold transition-colors hover:text-primary-text sm:px-6 sm:text-base",
          className,
        )}
        {...props}
      >
        {children}
        <PlusIcon
          aria-hidden="true"
          className="size-5 shrink-0 text-muted transition-transform duration-300 ease-[var(--ease-out-soft)] group-data-[state=open]:rotate-45 group-data-[state=open]:text-primary"
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

export function AccordionContent({
  className,
  children,
  ...props
}: ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      className="overflow-hidden data-[state=closed]:animate-[acc-up_240ms_var(--ease-out-soft)] data-[state=open]:animate-[acc-down_280ms_var(--ease-out-soft)]"
      {...props}
    >
      <div
        className={cn(
          "px-5 pb-5 text-[0.9375rem] leading-relaxed text-muted sm:px-6 sm:pb-6",
          className,
        )}
      >
        {children}
      </div>
    </AccordionPrimitive.Content>
  );
}
