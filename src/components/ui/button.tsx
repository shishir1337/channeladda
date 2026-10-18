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
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-[var(--ease-out-soft)] cursor-pointer select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0 app:rounded-lg app:duration-150",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-fg hover:bg-primary-hover shadow-soft hover:shadow-lift app:shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_1px_2px_rgb(0_0_0/0.08)] app:ring-1 app:ring-inset app:ring-black/10 app:hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_1px_2px_rgb(0_0_0/0.08)] app:disabled:bg-surface-3 app:disabled:text-subtle app:disabled:opacity-100 app:disabled:shadow-none app:disabled:ring-line",
        secondary:
          "bg-surface-2 text-fg border border-line hover:border-line-strong hover:bg-surface-3 app:bg-surface app:shadow-xs app:hover:bg-surface-2 app:dark:bg-surface-2 app:dark:hover:bg-surface-3",
        outline:
          "border border-line-strong text-fg hover:bg-surface-2 hover:border-primary/60 app:border-line app:hover:border-line-strong",
        ghost:
          "text-muted hover:text-fg hover:bg-surface-2 app:hover:bg-black/[0.04] app:dark:hover:bg-white/[0.06]",
        inverse: "bg-fg text-bg hover:opacity-90",
        // Destructive. Deliberately the only variant carrying the danger
        // colour, so nothing decorative can be mistaken for it.
        danger:
          "bg-danger text-white hover:opacity-90 shadow-soft hover:shadow-lift app:shadow-xs app:hover:shadow-xs",
      },
      size: {
        // 44px min height everywhere a finger might be the pointer.
        sm: "h-11 px-4 text-sm app:gap-1.5 app:px-3 app:text-[0.8125rem] app:[&_svg]:size-3.5 app:pointer-fine:h-8",
        md: "h-12 px-5 text-sm sm:text-[0.9375rem] app:h-11 app:px-3.5 app:text-sm app:[&_svg]:size-4 app:pointer-fine:h-9",
        lg: "h-14 px-7 text-base app:h-11 app:px-4 app:text-sm app:pointer-fine:h-10",
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
