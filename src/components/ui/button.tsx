import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Inside the app (`app:`) buttons drop to desktop-tool proportions — 32/36/40px,
 * 8px corners, no lift on hover — but only for a fine pointer. On a touch
 * screen they keep the 44px floor wherever they are.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-[var(--ease-out-soft)] cursor-pointer select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0 app:rounded-lg",
  {
    variants: {
      variant: {
        // Flat gold with a hairline and a highlight, everywhere: a lifted,
        // glowing button read as an advert on a page that is about trust.
        primary:
          "bg-primary text-primary-fg hover:bg-primary-hover shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_1px_2px_rgb(0_0_0/0.08)] ring-1 ring-inset ring-black/10 disabled:bg-surface-3 disabled:text-subtle disabled:opacity-100 disabled:shadow-none disabled:ring-line",
        secondary:
          "bg-surface text-fg border border-line shadow-xs hover:border-line-strong hover:bg-surface-2 dark:bg-surface-2 dark:hover:bg-surface-3",
        outline:
          "border border-line text-fg hover:bg-surface-2 hover:border-line-strong",
        ghost:
          "text-muted hover:text-fg hover:bg-surface-2 app:hover:bg-black/[0.04] app:dark:hover:bg-white/[0.06]",
        inverse: "bg-fg text-bg hover:opacity-90",
        // Destructive. Deliberately the only variant carrying the danger
        // colour, so nothing decorative can be mistaken for it.
        danger: "bg-danger text-white hover:opacity-90 shadow-xs",
        // For a destructive step that can be undone, or the first press of
        // one that asks again: red words, not a red block.
        "danger-outline":
          "border border-line bg-surface text-danger shadow-xs hover:border-danger/40 hover:bg-danger-soft dark:bg-surface-2 dark:hover:bg-danger-soft",
      },
      size: {
        // 44px min height everywhere a finger might be the pointer.
        sm: "h-11 px-4 text-sm app:gap-1.5 app:px-3 app:text-[0.8125rem] app:[&_svg]:size-3.5 app:pointer-fine:h-8",
        md: "h-11 px-4.5 text-sm sm:text-[0.9375rem] app:px-3.5 app:text-sm app:[&_svg]:size-4 app:pointer-fine:h-9",
        lg: "h-12 px-6 text-[0.9375rem] app:h-11 app:px-4 app:text-sm app:pointer-fine:h-10",
        icon: "size-11 app:pointer-fine:size-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
