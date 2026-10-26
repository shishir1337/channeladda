import { expect, test } from "vitest";
import { siteDate, siteDayMonth, siteMoment } from "@/lib/site-time";

// QA, 2026-10-26: CA-30107 finished on the evening of 26 October in
// Kolkata, and the certificate, rendered on a UTC server, said 25 October.
test("a date late in the UTC day reads as the next day in India", () => {
  const finished = new Date("2026-10-25T20:15:00Z"); // 01:45 on the 26th, IST
  expect(siteDate(finished)).toBe("26 October 2026");
  expect(siteDayMonth(finished, "short")).toBe("26 Oct");
});

test("without the reader's zone, a time of day says which zone it is in", () => {
  const at = new Date("2026-11-16T11:01:00Z"); // 16:31 IST
  expect(siteMoment(at)).toMatch(/^16 Nov( 2026)?, 4:31 PM India time$/);
});

test("with the reader's zone, it is their clock and needs no label", () => {
  const at = new Date("2026-11-16T11:01:00Z");
  const dhaka = { timeZone: "Asia/Dhaka", labelled: false };
  expect(siteMoment(at, dhaka)).toMatch(/^16 Nov( 2026)?, 5:01 PM$/);
  expect(siteDayMonth(at, "long", dhaka)).toBe("16 November");
});
