/**
 * Every date and time Channel Adda writes, in one style and in one zone.
 *
 * One style: "26 Oct, 3:53 AM" for a moment, "26 October 2026" for a day,
 * "3:53 AM" for a time today. The site used to say "5:41 am India time",
 * "26 Oct, 06:12", "28 Oct, 00:22 UTC", "26/10/2026, 04:43" and
 * "Oct 12, 3:41 PM", depending on the page.
 *
 * One zone: the reader's own. The browser writes its zone into the `tz`
 * cookie (see `TimeZoneProvider`), the server reads it back, and both draw
 * the same string. Until the cookie exists — a first visit — times are in
 * India time, where most of the marketplace is, and say so. Text written
 * for someone who is not looking at the page — an email, a certificate —
 * is in India time with the label too.
 *
 * The strings are put together here from the zone's numbers rather than
 * taken whole from `toLocaleString`. Browsers and Node disagree on the
 * small print — "Sep" or "Sept", a plain or a narrow no-break space before
 * "AM" — and any disagreement between the server's copy and the browser's
 * is a hydration error (React #418, on every chat page, 2026-10-26).
 */

/** Where most of the marketplace is: the zone before the browser has said. */
export const SITE_TIME_ZONE = "Asia/Kolkata";

/** Said after a time of day drawn in India time for someone who may not be. */
export const SITE_TIME_LABEL = "India time";

/** The cookie the browser keeps its own zone in. */
export const TZ_COOKIE = "tz";

/** The zone times are drawn in for one reader. */
export type ViewerZone = {
  /** An IANA name: "Asia/Dhaka", "UTC". */
  timeZone: string;
  /** Say "India time" after a time of day: the reader's zone is not known. */
  labelled: boolean;
};

/** India time, labelled: a first visit, an email, a certificate. */
export const SITE_ZONE: ViewerZone = {
  timeZone: SITE_TIME_ZONE,
  labelled: true,
};

// The longest IANA name is 32 characters (America/Argentina/ComodRivadavia).
const MAX_ZONE = 64;
const ZONE_SHAPE = /^[A-Za-z][A-Za-z0-9_+\-/]*$/;

/**
 * An IANA time zone this runtime knows, from a cookie anyone can write.
 * The shape is checked before Intl sees it, and the length is capped.
 */
export function isTimeZone(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > MAX_ZONE) return false;
  if (!ZONE_SHAPE.test(value)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * The reader's zone from the `tz` cookie: theirs, unlabelled, when it is a
 * real zone; India time, labelled, when it is missing or not a zone.
 */
export function zoneFromCookie(value: string | null | undefined): ViewerZone {
  if (!value) return SITE_ZONE;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return SITE_ZONE;
  }
  return isTimeZone(decoded)
    ? { timeZone: decoded, labelled: false }
    : SITE_ZONE;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

type Parts = {
  year: number;
  /** 1–12. */
  month: number;
  day: number;
  /** 0–23. */
  hour: number;
  minute: number;
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** The wall clock in a zone, as numbers. */
function partsIn(date: Date, zone: ViewerZone): Parts {
  const out: Parts = { year: 0, month: 1, day: 1, hour: 0, minute: 0 };
  for (const part of formatterFor(zone.timeZone).formatToParts(date)) {
    if (part.type in out) out[part.type as keyof Parts] = Number(part.value);
  }
  // Some engines write midnight as 24 even with h23.
  if (out.hour === 24) out.hour = 0;
  return out;
}

function sameDay(a: Parts, b: Parts): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

function monthName(month: number, length: "long" | "short"): string {
  const name = MONTHS[month - 1] ?? "";
  return length === "long" ? name : name.slice(0, 3);
}

function withLabel(text: string, zone: ViewerZone): string {
  return zone.labelled ? `${text} ${SITE_TIME_LABEL}` : text;
}

function clockOf(parts: Parts): string {
  const half = parts.hour < 12 ? "AM" : "PM";
  const hour = parts.hour % 12 === 0 ? 12 : parts.hour % 12;
  return `${hour}:${String(parts.minute).padStart(2, "0")} ${half}`;
}

/** "3:53 AM" — "3:53 AM India time" before the reader's zone is known. */
export function clockTime(date: Date, zone: ViewerZone = SITE_ZONE): string {
  return withLabel(clockOf(partsIn(date, zone)), zone);
}

/** "26 Oct", or "26 October" with `long`. No year, no time. */
export function dayMonth(
  date: Date,
  zone: ViewerZone = SITE_ZONE,
  month: "long" | "short" = "short",
): string {
  const parts = partsIn(date, zone);
  return `${parts.day} ${monthName(parts.month, month)}`;
}

/** "26 October 2026". */
export function longDate(date: Date, zone: ViewerZone = SITE_ZONE): string {
  const parts = partsIn(date, zone);
  return `${parts.day} ${monthName(parts.month, "long")} ${parts.year}`;
}

/**
 * "26 Oct" this year, "31 Dec 2025" in another: a day in a list or a
 * table, where the time of day does not matter.
 */
export function shortDate(
  date: Date,
  zone: ViewerZone = SITE_ZONE,
  now: Date = new Date(),
): string {
  const parts = partsIn(date, zone);
  const day = `${parts.day} ${monthName(parts.month, "short")}`;
  return parts.year === partsIn(now, zone).year ? day : `${day} ${parts.year}`;
}

/**
 * "26 Oct, 3:53 AM", or "31 Dec 2025, 11:00 PM" in another year: a moment
 * somebody may wait for or look back on.
 */
export function dayAndTime(
  date: Date,
  zone: ViewerZone = SITE_ZONE,
  now: Date = new Date(),
): string {
  const parts = partsIn(date, zone);
  const day = `${parts.day} ${monthName(parts.month, "short")}`;
  const dated =
    parts.year === partsIn(now, zone).year ? day : `${day} ${parts.year}`;
  return withLabel(`${dated}, ${clockOf(parts)}`, zone);
}

/**
 * The time on a line of a conversation: "3:41 PM" today, "12 Oct, 3:41 PM"
 * before. "Today" is the reader's day, not the server's.
 */
export function chatTime(
  date: Date | string,
  zone: ViewerZone = SITE_ZONE,
  now: Date = new Date(),
): string {
  const at = typeof date === "string" ? new Date(date) : date;
  return sameDay(partsIn(at, zone), partsIn(now, zone))
    ? clockTime(at, zone)
    : dayAndTime(at, zone, now);
}

/**
 * The time beside a conversation in a list: "3:41 PM" today, the day before
 * that — "12 Oct", "31 Dec 2025". Never labelled: a list has no room, and
 * the conversation itself says.
 */
export function listTime(
  date: Date | string,
  zone: ViewerZone = SITE_ZONE,
  now: Date = new Date(),
): string {
  const at = typeof date === "string" ? new Date(date) : date;
  return sameDay(partsIn(at, zone), partsIn(now, zone))
    ? clockOf(partsIn(at, zone))
    : shortDate(at, zone, now);
}
