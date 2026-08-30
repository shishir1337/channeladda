import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

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
