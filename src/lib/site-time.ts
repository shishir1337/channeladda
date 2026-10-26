/**
 * The old names for `@/lib/time`, kept so the files that use them need not
 * change at once. Without a zone they write India time and say so — right
 * for an email or a certificate. A page passes the reader's zone:
 * `await viewerZone()` on the server, `useViewerZone()` in a Client
 * Component.
 */
import {
  dayAndTime,
  dayMonth,
  longDate,
  SITE_ZONE,
  type ViewerZone,
} from "@/lib/time";

export { SITE_TIME_LABEL, SITE_TIME_ZONE } from "@/lib/time";

/** "26 October 2026". */
export function siteDate(date: Date, zone: ViewerZone = SITE_ZONE): string {
  return longDate(date, zone);
}

/** "26 October", or "26 Oct" with `short`. */
export function siteDayMonth(
  date: Date,
  month: "long" | "short" = "long",
  zone: ViewerZone = SITE_ZONE,
): string {
  return dayMonth(date, zone, month);
}

/** "16 Nov, 4:31 PM", and "… India time" without the reader's zone. */
export function siteMoment(date: Date, zone: ViewerZone = SITE_ZONE): string {
  return dayAndTime(date, zone);
}
