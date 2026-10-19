import { expect, test } from "vitest";
import {
  activeWait,
  formatCountdown,
  holdDaysFor,
  type WaitInput,
} from "@/lib/deal-waits";

// A deal spends most of its life waiting on a clock nobody in the chat can
// see: the payment window, Google's owner wait, the holding period. The chat
// shows whichever one is running, counting down.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date("2026-10-20T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const ahead = (ms: number) => new Date(NOW.getTime() + ms);

function deal(overrides: Partial<WaitInput> = {}): WaitInput {
  return {
    mode: "SAFEST",
    status: "AWAITING_CUSTODY",
    createdAt: ago(DAY),
    holdUntil: null,
    paymentWindowHours: 48,
    now: NOW,
    ...overrides,
  };
}

test("an unpaid deal counts down its payment window", () => {
  const wait = activeWait(
    deal({ status: "AWAITING_PAYMENT", createdAt: ago(10 * HOUR) }),
  );
  expect(wait).toEqual({
    label: "Payment window closes",
    until: ahead(38 * HOUR),
  });
});

test("a payment window already past shows nothing — the sweep will close it", () => {
  expect(
    activeWait(deal({ status: "AWAITING_PAYMENT", createdAt: ago(49 * HOUR) })),
  ).toBeNull();
});

test("a Safest deal waiting on Google counts down to our agent becoming primary owner", () => {
  expect(activeWait(deal({ holdUntil: ahead(5 * DAY) }))).toEqual({
    label: "Google's wait ends",
    until: ahead(5 * DAY),
  });
});

test("a Fastest deal in its holding period counts down to the buyer becoming primary owner", () => {
  expect(
    activeWait(
      deal({
        mode: "FASTEST",
        status: "AWAITING_HANDOVER",
        holdUntil: ahead(3 * DAY),
      }),
    ),
  ).toEqual({
    label: "Holding period ends",
    until: ahead(3 * DAY),
  });
});

test("a hold that has ended shows no clock", () => {
  expect(activeWait(deal({ holdUntil: ago(HOUR) }))).toBeNull();
  expect(activeWait(deal({ holdUntil: null }))).toBeNull();
});

test("the hold lasts Google's owner wait on Safest and the platform's holding period on Fastest", () => {
  expect(holdDaysFor("SAFEST", "YOUTUBE")).toBe(7);
  expect(holdDaysFor("SAFEST", "INSTAGRAM")).toBe(0);
  // The client's seven days, on the platform they trade most.
  expect(holdDaysFor("FASTEST", "YOUTUBE")).toBe(7);
  expect(holdDaysFor("FASTEST", "INSTAGRAM")).toBe(21);
});

test("a finished, stopped or disputed deal has no clock running", () => {
  for (const status of ["COMPLETED", "CANCELLED", "DISPUTED"] as const) {
    expect(activeWait(deal({ status, holdUntil: ahead(DAY) }))).toBeNull();
  }
});

test("countdowns read at the right grain", () => {
  expect(formatCountdown(4 * DAY + 6 * HOUR + 59 * 60_000)).toBe("4d 6h");
  expect(formatCountdown(5 * HOUR + 12 * 60_000 + 30_000)).toBe("5h 12m");
  expect(formatCountdown(12 * 60_000 + 5_000)).toBe("12m 05s");
  expect(formatCountdown(45_000)).toBe("45s");
  expect(formatCountdown(0)).toBe("now");
  expect(formatCountdown(-5_000)).toBe("now");
});
