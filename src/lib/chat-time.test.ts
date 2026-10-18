import { expect, test } from "vitest";
import { timeLeft } from "@/lib/chat-time";

const NOW = Date.parse("2026-10-18T12:00:00Z");
const inHours = (h: number) => new Date(NOW + h * 3_600_000).toISOString();

test("a fresh 48-hour offer does not read as one day", () => {
  // Seen in the walkthrough: "Offer sent. The seller has 48 hours to
  // respond", and the card beside it said "1d left" — 47 hours and change,
  // rounded down to half the truth.
  expect(timeLeft(inHours(47.9), NOW)).toBe("47h left");
  expect(timeLeft(inHours(30), NOW)).toBe("30h left");
});

test("two days and more are counted in days", () => {
  expect(timeLeft(inHours(48), NOW)).toBe("2d left");
  expect(timeLeft(inHours(80), NOW)).toBe("3d left");
});

test("the last hour is counted in minutes, and a past time is expired", () => {
  expect(timeLeft(inHours(0.5), NOW)).toBe("30m left");
  expect(timeLeft(inHours(-1), NOW)).toBe("expired");
});
