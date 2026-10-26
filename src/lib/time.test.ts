import { expect, test } from "vitest";
import {
  chatTime,
  clockTime,
  dayAndTime,
  dayMonth,
  isTimeZone,
  listTime,
  longDate,
  SITE_ZONE,
  shortDate,
  type ViewerZone,
  zoneFromCookie,
} from "@/lib/time";

const zone = (timeZone: string): ViewerZone => ({ timeZone, labelled: false });
const DHAKA = zone("Asia/Dhaka");
const UTC = zone("UTC");
const NEW_YORK = zone("America/New_York");

// 03:53 in Dhaka, 03:23 in Kolkata, 21:53 the evening before in UTC.
const AT = new Date("2026-10-25T21:53:00Z");
const NOW = new Date("2026-10-26T06:00:00Z");

test("one style: 26 Oct, 3:53 AM / 26 October 2026 / 3:53 AM", () => {
  expect(dayAndTime(AT, DHAKA, NOW)).toBe("26 Oct, 3:53 AM");
  expect(longDate(AT, DHAKA)).toBe("26 October 2026");
  expect(clockTime(AT, DHAKA)).toBe("3:53 AM");
  expect(dayMonth(AT, DHAKA)).toBe("26 Oct");
  expect(dayMonth(AT, DHAKA, "long")).toBe("26 October");
});

test("the same moment reads in each reader's own zone", () => {
  expect(dayAndTime(AT, UTC, NOW)).toBe("25 Oct, 9:53 PM");
  expect(dayAndTime(AT, NEW_YORK, NOW)).toBe("25 Oct, 5:53 PM");
  expect(longDate(AT, UTC)).toBe("25 October 2026");
});

test("before the browser has said, it is India time and says so", () => {
  expect(dayAndTime(AT, SITE_ZONE, NOW)).toBe("26 Oct, 3:23 AM India time");
  expect(clockTime(AT)).toBe("3:23 AM India time");
  // A date carries no label: there is no time of day to misread.
  expect(longDate(AT)).toBe("26 October 2026");
});

test("noon, midnight and the minutes are written plainly", () => {
  expect(clockTime(new Date("2026-10-26T06:00:00Z"), DHAKA)).toBe("12:00 PM");
  expect(clockTime(new Date("2026-10-25T18:00:00Z"), DHAKA)).toBe("12:00 AM");
  expect(clockTime(new Date("2026-10-26T04:05:00Z"), DHAKA)).toBe("10:05 AM");
});

test("September is Sep, in every engine", () => {
  // Node's en-GB says "Sept" and some browsers "Sep": a server and a browser
  // that disagree is a hydration error, so the names are our own.
  expect(dayMonth(new Date("2026-09-03T06:00:00Z"), DHAKA)).toBe("3 Sep");
});

test("the year is said only when it is not this one", () => {
  const old = new Date("2025-12-31T17:00:00Z"); // 11:00 PM in Dhaka
  expect(dayAndTime(old, DHAKA, NOW)).toBe("31 Dec 2025, 11:00 PM");
  expect(shortDate(old, DHAKA, NOW)).toBe("31 Dec 2025");
  expect(shortDate(AT, DHAKA, NOW)).toBe("26 Oct");
  // New Year's Eve in UTC is already next year in Dhaka.
  const eve = new Date("2026-12-31T20:00:00Z");
  expect(shortDate(eve, DHAKA, new Date("2027-01-01T02:00:00Z"))).toBe("1 Jan");
});

test("a chat line is today's time, or the day and time before", () => {
  expect(chatTime(AT.toISOString(), DHAKA, NOW)).toBe("3:53 AM");
  // Still the 25th in New York, where it is now 2 AM on the 26th.
  expect(chatTime(AT.toISOString(), NEW_YORK, NOW)).toBe("25 Oct, 5:53 PM");
  expect(listTime(AT.toISOString(), DHAKA, NOW)).toBe("3:53 AM");
  expect(listTime(AT.toISOString(), NEW_YORK, NOW)).toBe("25 Oct");
});

test("a real zone from the cookie is used, unlabelled", () => {
  expect(zoneFromCookie("Asia/Dhaka")).toEqual(DHAKA);
  expect(zoneFromCookie("America%2FNew_York")).toEqual(NEW_YORK);
  expect(zoneFromCookie("UTC")).toEqual(UTC);
  // Chrome in India reports the old name; it is still a zone.
  expect(zoneFromCookie("Asia/Calcutta")).toEqual(zone("Asia/Calcutta"));
});

test("no cookie, or a cookie that is not a zone, means India time", () => {
  expect(zoneFromCookie(undefined)).toBe(SITE_ZONE);
  expect(zoneFromCookie("")).toBe(SITE_ZONE);
  expect(zoneFromCookie("Mars/Olympus_Mons")).toBe(SITE_ZONE);
  expect(zoneFromCookie("<script>alert(1)</script>")).toBe(SITE_ZONE);
  expect(zoneFromCookie("%E0%A4%A")).toBe(SITE_ZONE);
  expect(zoneFromCookie(`Asia/${"x".repeat(80)}`)).toBe(SITE_ZONE);
  expect(zoneFromCookie("+05:30")).toBe(SITE_ZONE);
});

test("isTimeZone checks the shape before asking Intl", () => {
  expect(isTimeZone("Asia/Kolkata")).toBe(true);
  expect(isTimeZone("Etc/GMT+5")).toBe(true);
  expect(isTimeZone(42)).toBe(false);
  expect(isTimeZone("Asia/Dhaka; Path=/")).toBe(false);
  expect(isTimeZone("../../etc/passwd")).toBe(false);
});
