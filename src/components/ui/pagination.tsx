import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Slot = { key: string; page: number | null };

/** First, last and the pages either side of the current one, with ellipses. */
function buildSlots(page: number, pageCount: number): Slot[] {
  const slots: Slot[] = [];
  for (let i = 1; i <= pageCount; i++) {
    if (i === 1 || i === pageCount || Math.abs(i - page) <= 1) {
      slots.push({ key: `p${i}`, page: i });
    } else if (slots.at(-1)?.page !== null) {
      slots.push({ key: `gap-before-${i}`, page: null });
    }
  }
  return slots;
}

/**
 * Link-based pagination so pages stay server-rendered, shareable and
 * crawlable.
 */
export function Pagination({
  page,
  pageCount,
  hrefFor,
  className,
}: {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
  className?: string;
}) {
  if (pageCount <= 1) return null;

  const slots = buildSlots(page, pageCount);

  return (
    <nav
      aria-label="Pagination"
      className={cn("flex items-center justify-center gap-1.5", className)}
    >
      <Step href={hrefFor(page - 1)} disabled={page <= 1} label="Previous page">
        <ChevronLeftIcon aria-hidden="true" className="size-4" />
      </Step>

      <ul className="flex items-center gap-1.5">
        {slots.map((slot) =>
          slot.page === null ? (
            <li
              key={slot.key}
              aria-hidden="true"
              className="px-1 text-sm text-subtle"
            >
              &hellip;
            </li>
          ) : (
            <li key={slot.key}>
              <Link
                href={hrefFor(slot.page)}
                aria-current={slot.page === page ? "page" : undefined}
                aria-label={`Page ${slot.page}`}
                className={cn(
                  "tnum inline-flex size-11 items-center justify-center rounded-xl border text-sm font-medium transition-colors duration-200",
                  slot.page === page
                    ? "border-primary bg-primary text-primary-fg"
                    : "border-line text-muted hover:border-line-strong hover:bg-surface-2 hover:text-fg",
                )}
              >
                {slot.page}
              </Link>
            </li>
          ),
        )}
      </ul>

      <Step
        href={hrefFor(page + 1)}
        disabled={page >= pageCount}
        label="Next page"
      >
        <ChevronRightIcon aria-hidden="true" className="size-4" />
      </Step>
    </nav>
  );
}

const stepClass =
  "inline-flex size-11 items-center justify-center rounded-xl border border-line text-muted transition-colors duration-200";

function Step({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: ReactNode;
}) {
  // A real disabled button rather than an inert link, so the state is
  // announced and the control is skipped in the tab order.
  if (disabled) {
    return (
      <button
        type="button"
        disabled
        aria-label={label}
        className={cn(stepClass, "cursor-not-allowed opacity-40")}
      >
        {children}
      </button>
    );
  }

  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        stepClass,
        "hover:border-line-strong hover:bg-surface-2 hover:text-fg",
      )}
    >
      {children}
    </Link>
  );
}
