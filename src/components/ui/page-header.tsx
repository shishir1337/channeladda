import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Container } from "@/components/ui/section";
import { cn } from "@/lib/utils";

export type Crumb = { label: string; href?: string };

/**
 * Standard top-of-page block for every inner route: breadcrumb, title,
 * optional description, and a slot for page-level actions.
 */
export function PageHeader({
  crumbs,
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: {
  crumbs?: Crumb[];
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border-b border-line bg-bg-subtle", className)}>
      <Container className="py-8 sm:py-11">
        {crumbs?.length ? (
          <nav aria-label="Breadcrumb" className="mb-5">
            <ol className="flex flex-wrap items-center gap-1 text-xs text-subtle">
              {crumbs.map((crumb, i) => (
                <li key={crumb.label} className="flex items-center gap-1">
                  {i > 0 ? (
                    <ChevronRightIcon
                      aria-hidden="true"
                      className="size-3.5 shrink-0 text-line-strong"
                    />
                  ) : null}
                  {crumb.href ? (
                    <Link
                      href={crumb.href}
                      className="rounded px-0.5 py-1 transition-colors hover:text-fg"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span
                      aria-current="page"
                      className="px-0.5 py-1 text-muted"
                    >
                      {crumb.label}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        ) : null}

        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            {eyebrow ? (
              <p className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-primary-text uppercase">
                <span aria-hidden="true" className="h-px w-6 bg-primary/50" />
                {eyebrow}
              </p>
            ) : null}
            <h1 className="text-[1.75rem] leading-[1.12] font-bold sm:text-4xl lg:text-[2.6rem]">
              {title}
            </h1>
            {description ? (
              <p className="mt-4 text-[0.9375rem] leading-relaxed text-muted sm:text-base">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>

        {children}
      </Container>
    </div>
  );
}
