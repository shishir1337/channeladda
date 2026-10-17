import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * A rating, or the honest absence of one.
 *
 * A seller with no reviews used to render “5.0” and five filled stars on a
 * page promising that ratings come only from completed orders and cannot be
 * bought. Nobody earned that number.
 */
export function ratingLabel(rating: number | null): string {
  return rating === null ? "New" : rating.toFixed(1);
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 1_240_000 -> "1.24M". Keeps follower counts readable inside narrow cards. */
export function formatCompact(value: number) {
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `${m >= 100 ? Math.round(m) : Number(m.toFixed(m >= 10 ? 1 : 2))}M`;
  }
  if (value >= 1_000) {
    const k = value / 1_000;
    return `${k >= 100 ? Math.round(k) : Number(k.toFixed(1))}K`;
  }
  return String(value);
}
