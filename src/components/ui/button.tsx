import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-[var(--ease-out-soft)] cursor-pointer select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-fg hover:bg-primary-hover shadow-soft hover:shadow-lift",
        secondary:
          "bg-surface-2 text-fg border border-line hover:border-line-strong hover:bg-surface-3",
        outline:
          "border border-line-strong text-fg hover:bg-surface-2 hover:border-primary/60",
        ghost: "text-muted hover:text-fg hover:bg-surface-2",
        inverse: "bg-fg text-bg hover:opacity-90",
        // Destructive. Deliberately the only variant carrying the danger
        // colour, so nothing decorative can be mistaken for it.
        danger:
          "bg-danger text-white hover:opacity-90 shadow-soft hover:shadow-lift",
      },
      size: {
        // 44px min height everywhere — meets the touch-target floor.
        sm: "h-11 px-4 text-sm",
        md: "h-12 px-5 text-sm sm:text-[0.9375rem]",
        lg: "h-14 px-7 text-base",
        icon: "size-11",
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
