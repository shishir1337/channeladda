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
  image,
  className,
}: {
  initials: string;
  /** The seller's own photo, shown in place of the initials when there is one. */
  image?: string | null;
  className?: string;
}) {
  if (image) {
    return (
      // biome-ignore lint/performance/noImgElement: the seller's own upload, a small square served from our origin.
      <img
        src={image}
        alt=""
        aria-hidden="true"
        className={cn(
          "size-12 shrink-0 rounded-full bg-surface-2 object-cover ring-1 ring-line ring-inset",
          className,
        )}
      />
    );
  }
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
