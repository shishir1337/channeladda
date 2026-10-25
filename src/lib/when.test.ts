import { expect, test } from "vitest";
import { clockTime, dayAndTime } from "@/lib/when";

test("a time reads one way: 3:53 AM, and 26 Oct, 3:53 AM", () => {
  const at = new Date(2026, 9, 26, 3, 53);
  expect(clockTime(at)).toBe("3:53 AM");
  expect(dayAndTime(at, new Date(2026, 0, 1))).toBe("26 Oct, 3:53 AM");
  expect(dayAndTime(new Date(2026, 9, 26, 16, 5), at)).toBe("26 Oct, 4:05 PM");
});

test("the year is said only when it is not this one", () => {
  expect(dayAndTime(new Date(2025, 11, 31, 23, 0), new Date(2026, 9, 26))).toBe(
    "31 Dec 2025, 11:00 PM",
  );
});
