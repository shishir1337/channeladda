import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Consistent page gutters + max width for every band on the page. */
export function Container({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[81rem] px-4 sm:px-6 lg:px-8",
        className,
      )}
      {...props}
    />
  );
}

export function Section({
  className,
  children,
  ...props
}: ComponentProps<"section">) {
  return (
    <section className={cn("py-14 sm:py-20 lg:py-24", className)} {...props}>
      {children}
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  action,
  className,
}: {
  eyebrow?: string;
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
        "flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between",
        centered && "sm:flex-col sm:items-center",
        className,
      )}
    >
      <div className={cn("max-w-2xl", centered && "text-center")}>
        {eyebrow ? (
          <p
            className={cn(
              "mb-3 flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-primary-text uppercase",
              centered && "justify-center",
            )}
          >
            <span aria-hidden="true" className="h-px w-6 bg-primary/50" />
            {eyebrow}
          </p>
        ) : null}
        <h2 className="text-[1.75rem] leading-[1.15] font-bold sm:text-4xl lg:text-[2.75rem]">
          {title}
        </h2>
        {description ? (
          <p className="mt-4 text-[0.9375rem] leading-relaxed text-muted sm:text-base">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
