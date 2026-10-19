import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Container } from "@/components/ui/section";

export type Crumb = { label: string; href?: string };

/** The trail above a page title; the last crumb is the page itself. */
export function Breadcrumbs({
  crumbs,
  className,
}: {
  crumbs: Crumb[];
  className?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1 text-[0.8125rem] text-subtle">
        {crumbs.map((crumb, i) => (
          <li key={crumb.label} className="flex min-w-0 items-center gap-1">
            {i > 0 ? (
              <ChevronRightIcon
                aria-hidden="true"
                className="size-3.5 shrink-0 text-line-strong"
              />
            ) : null}
            {crumb.href ? (
              <Link
                href={crumb.href}
                className="rounded px-0.5 py-1 transition-colors duration-150 hover:text-fg"
              >
                {crumb.label}
              </Link>
            ) : (
              <span
                aria-current="page"
                className="truncate px-0.5 py-1 text-muted"
              >
                {crumb.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * Standard top-of-page block for every inner route: breadcrumb, title,
 * a line or two of lead, and a slot for page-level actions. No eyebrow:
 * the title says what the page is.
 */
export function PageHeader({
  crumbs,
  title,
  description,
  actions,
  children,
  className,
}: {
  crumbs?: Crumb[];
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    // No band and no rule: the title and its lead open the page, and the
    // first section's own space separates them from what follows.
    <div className={className}>
      <Container className="pt-10 pb-2 sm:pt-12">
        {crumbs?.length ? (
          <Breadcrumbs crumbs={crumbs} className="mb-5" />
        ) : null}

        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-[1.875rem] leading-[1.1] font-semibold tracking-[-0.03em] sm:text-[2.5rem]">
              {title}
            </h1>
            {description ? (
              <p className="mt-3 text-base leading-relaxed text-muted sm:text-lg">
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
