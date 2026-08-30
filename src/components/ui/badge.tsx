import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        neutral: "bg-surface-2 text-muted border border-line",
        verified: "bg-verified-soft text-verified border border-verified/25",
        primary: "bg-primary-soft text-primary-text border border-primary/30",
        info: "bg-info-soft text-info border border-info/25",
        danger: "bg-danger-soft text-danger border border-danger/25",
        solid: "bg-primary text-primary-fg",
      },
      size: {
        sm: "px-2 py-0.5 text-[0.6875rem] [&_svg]:size-3",
        md: "px-2.5 py-1 text-xs [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "neutral", size: "sm" },
  },
);

export function Badge({
  className,
  variant,
  size,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  );
}
