/**
 * One way of writing a time on the dashboard: "3:53 AM", and "26 Oct,
 * 3:53 AM" when the day matters — with the year only when it is not this
 * one. The same page used to say "4:23", "3:53 AM" and "26/10/2026, 04:43".
 *
 * Formatted where it is read, so in a Client Component it is the reader's
 * own clock; drawn on the server it is the server's.
 */

/** "3:53 AM". */
export function clockTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "26 Oct, 3:53 AM", or "26 Oct 2025, 3:53 AM" in another year. */
export function dayAndTime(date: Date, now: Date = new Date()): string {
  const day = date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
  return `${day}, ${clockTime(date)}`;
}
