import { StarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const KEYS = ["one", "two", "three", "four", "five"] as const;

/**
 * A rating as five stars: filled up to the rounded rating, outlined after.
 *
 * Draws nothing for someone with no reviews — five filled stars beside
 * "New (0 reviews)" told a buyer the opposite of the truth. Decorative: the
 * figure beside it is what a screen reader hears.
 */
export function Stars({
  rating,
  className,
}: {
  rating: number | null;
  className?: string;
}) {
  if (rating === null) return null;
  const filled = Math.round(rating);
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex items-center gap-0.5", className)}
    >
      {KEYS.map((key, index) => (
        <StarIcon
          key={key}
          className={cn(
            "size-3.5",
            index < filled
              ? "fill-primary text-primary"
              : "fill-transparent text-line-strong",
          )}
        />
      ))}
    </span>
  );
}
