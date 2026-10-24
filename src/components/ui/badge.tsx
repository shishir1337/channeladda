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
        // Lapsed or set aside: expired, paused.
        warning:
          "bg-orange-500/10 text-orange-700 border border-orange-500/25 dark:text-orange-300",
        // Held mid-way: countered, reserved, in our hands.
        accent:
          "bg-violet-500/10 text-violet-700 border border-violet-500/25 dark:text-violet-300",
        // Finished well: completed, sold. Filled, so an ending reads apart
        // from "live".
        success: "bg-verified text-bg border border-verified",
        solid: "bg-primary text-primary-fg",
      },
      size: {
        sm: "px-2 py-0.5 text-[0.6875rem] [&_svg]:size-3 app:h-5 app:py-0 app:text-xs app:leading-none",
        md: "px-2.5 py-1 text-xs [&_svg]:size-3.5 app:h-6 app:px-2 app:py-0 app:leading-none",
      },
    },
    defaultVariants: { variant: "neutral", size: "sm" },
  },
);

export type BadgeVariant = NonNullable<
  VariantProps<typeof badgeVariants>["variant"]
>;

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
