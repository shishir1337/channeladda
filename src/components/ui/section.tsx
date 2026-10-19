import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Page gutters and the measure. Grids of cards use the full 80rem; pages
 * that are mostly reading pass `narrow` for 72rem, so a line of prose never
 * runs the width of a wide monitor.
 */
export function Container({
  className,
  narrow = false,
  ...props
}: ComponentProps<"div"> & { narrow?: boolean }) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 sm:px-6 lg:px-8",
        narrow ? "max-w-[72rem]" : "max-w-[80rem]",
        className,
      )}
      {...props}
    />
  );
}

/**
 * One band of a page. Sections are told apart by space, not by stripes:
 * 64px between two on a phone, 96px on a computer. A page may give one
 * section `bg-bg-subtle` when it genuinely stands apart.
 */
export function Section({
  className,
  children,
  ...props
}: ComponentProps<"section">) {
  return (
    <section className={cn("py-8 sm:py-10 lg:py-12", className)} {...props}>
      {children}
    </section>
  );
}

/**
 * A section's title, one line of description, and an optional action on the
 * right. No eyebrow above it: the title does that job, in sentence case.
 */
export function SectionHeading({
  title,
  description,
  align = "left",
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
  action?: ReactNode;
  className?: string;
}) {
  const centered = align === "center";
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        centered && "sm:flex-col sm:items-center",
        className,
      )}
    >
      <div className={cn("max-w-2xl", centered && "text-center")}>
        <h2 className="text-[1.625rem] leading-[1.15] font-semibold tracking-[-0.025em] sm:text-[2rem]">
          {title}
        </h2>
        {description ? (
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted sm:text-base">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
