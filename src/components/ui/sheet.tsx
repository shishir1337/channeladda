"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetTitle = DialogPrimitive.Title;
export const SheetDescription = DialogPrimitive.Description;

export function SheetContent({
  className,
  children,
  side = "right",
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  /** Navigation opens from the side its button is on. */
  side?: "left" | "right";
}) {
  return (
    <DialogPrimitive.Portal>
      {/* Scrim strong enough to isolate the panel in both themes. */}
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=closed]:animate-[fade-out_200ms_ease-in] data-[state=open]:animate-[fade-in_240ms_ease-out] app:bg-black/40 app:backdrop-blur-[2px]" />
      <DialogPrimitive.Content
        className={cn(
          "fixed inset-y-0 z-50 flex w-full max-w-[22rem] flex-col bg-bg shadow-lift",
          side === "right"
            ? "right-0 border-l border-line data-[state=closed]:animate-[slide-out_220ms_var(--ease-out-soft)] data-[state=open]:animate-[slide-in_300ms_var(--ease-out-soft)]"
            : "left-0 border-r border-line data-[state=closed]:animate-[slide-out-left_200ms_var(--ease-out-soft)] data-[state=open]:animate-[slide-in-left_260ms_var(--ease-out-soft)]",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="absolute top-4 right-4 inline-flex size-11 cursor-pointer items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-fg app:top-1.5 app:right-1.5"
          aria-label="Close menu"
        >
          <XIcon aria-hidden="true" className="size-5 app:size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
