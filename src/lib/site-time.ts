/**
 * The one clock Channel Adda's dates are written in.
 *
 * Dates rendered on the server came out in the server's zone — UTC — so a
 * deal finished on the evening of 26 October in Kolkata got a certificate
 * saying 25 October (QA, 2026-10-26). Every date a page or a message writes
 * about a deal goes through here instead, in India time, where most of the
 * marketplace is. Wherever a time of day is given, the zone is named with
 * it, since a buyer elsewhere would otherwise read it as their own.
 */
export const SITE_TIME_ZONE = "Asia/Kolkata";

/** Said after a time of day, so nobody reads it in their own zone. */
export const SITE_TIME_LABEL = "India time";

/** "26 October 2026". */
export function siteDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: SITE_TIME_ZONE,
  });
}

/** "26 October", or "26 Oct" with `short`. */
export function siteDayMonth(date: Date, month: "long" | "short" = "long") {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month,
    timeZone: SITE_TIME_ZONE,
  });
}

/** "4:31 pm". */
export function siteClock(date: Date): string {
  return date
    .toLocaleTimeString("en-GB", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: SITE_TIME_ZONE,
    })
    .replace(/\s?([ap])\.?m\.?$/i, (_, half: string) => ` ${half}m`)
    .toLowerCase();
}

/** "16 November, 4:31 pm India time": a moment somebody waits for. */
export function siteMoment(date: Date): string {
  return `${siteDayMonth(date)}, ${siteClock(date)} ${SITE_TIME_LABEL}`;
}
