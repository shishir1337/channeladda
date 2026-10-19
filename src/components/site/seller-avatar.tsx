import { cn } from "@/lib/utils";

/**
 * A seller, by their initials.
 *
 * The site used to point every seller at `/media/sellers/{slug}.svg`, which
 * exists only for the sample sellers, so a real seller showed an empty
 * circle. Initials always exist, and read as the same quiet disc the
 * dashboards use for people.
 */
export function SellerAvatar({
  initials,
  className,
}: {
  initials: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-linear-to-b from-surface-2 to-surface-3 text-sm font-semibold text-fg ring-1 ring-line ring-inset select-none",
        className,
      )}
    >
      {initials}
    </span>
  );
}
