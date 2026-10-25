import { expect, test } from "vitest";
import { siteClock, siteDate, siteDayMonth, siteMoment } from "@/lib/site-time";

// QA, 2026-10-26: CA-30107 finished on the evening of 26 October in
// Kolkata, and the certificate, rendered on a UTC server, said 25 October.
test("a date late in the UTC day reads as the next day in India", () => {
  const finished = new Date("2026-10-25T20:15:00Z"); // 01:45 on the 26th, IST
  expect(siteDate(finished)).toBe("26 October 2026");
  expect(siteDayMonth(finished, "short")).toBe("26 Oct");
});

test("a time of day says which zone it is in", () => {
  const at = new Date("2026-11-16T11:01:00Z"); // 16:31 IST
  expect(siteClock(at)).toBe("4:31 pm");
  expect(siteMoment(at)).toBe("16 November, 4:31 pm India time");
});
