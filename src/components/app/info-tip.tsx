"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import { InfoIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The explanation, one tap away instead of a paragraph on the page.
 *
 * A dashboard that explains itself in prose under every heading reads as a
 * document; the same words behind a small (i) keep the page calm and are
 * still there for whoever wants them. Opens on hover and keyboard focus like
 * a tooltip, and on a tap too — a plain tooltip never opens under a finger.
 */
export function InfoTip({
  children,
  label = "More about this",
  side = "top",
  className,
}: {
  children: ReactNode;
  /** What the button is called to a screen reader. */
  label?: string;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Tooltip.Provider delayDuration={150} skipDelayDuration={100}>
      <Tooltip.Root open={open} onOpenChange={setOpen}>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            aria-label={label}
            onClick={(event) => {
              // Radix closes a tooltip on click; here a click is how a
              // touch screen opens it, so it toggles instead.
              event.preventDefault();
              setOpen((was) => !was);
            }}
            className={cn(
              "relative inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full align-middle text-subtle transition-colors duration-150 hover:text-fg focus-visible:text-fg data-[state=delayed-open]:text-fg data-[state=instant-open]:text-fg",
              // A 44px target under a finger without moving the icon.
              "pointer-coarse:after:absolute pointer-coarse:after:-inset-3 pointer-coarse:after:content-['']",
              className,
            )}
          >
            <InfoIcon aria-hidden="true" className="size-3.5" />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side={side}
            sideOffset={6}
            collisionPadding={12}
            className="z-50 max-w-[19rem] rounded-lg border border-line bg-surface px-3 py-2.5 text-[0.8125rem] leading-relaxed text-muted shadow-lift data-[state=closed]:animate-pop-out data-[state=delayed-open]:animate-pop-in data-[state=instant-open]:animate-pop-in"
          >
            {children}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
