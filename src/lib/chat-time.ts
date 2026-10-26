/**
 * How long an open offer has left, coarsely: "2d left", "31h left", "40m left".
 *
 * Coarse on purpose. The page is drawn on the server and again in the
 * browser, and a figure in minutes would differ between the two often enough
 * to matter; hours rarely do.
 */
export function timeLeft(iso: string, now = Date.now()): string {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return "expired";
  const hours = Math.floor(ms / 3_600_000);
  // Days only from two of them: under 48 hours, a whole-day figure rounds a
  // fresh two-day offer down to "1d left" — half of what is really there.
  if (hours >= 48) return `${Math.floor(hours / 24)}d left`;
  if (hours >= 1) return `${hours}h left`;
  return `${Math.max(1, Math.round(ms / 60_000))}m left`;
}
