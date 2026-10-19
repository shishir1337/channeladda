import { expect, test } from "vitest";
import { activeWait, formatCountdown, type WaitInput } from "@/lib/deal-waits";

// A deal spends most of its life waiting on a clock nobody in the chat can
// see: the payment window, Google's owner wait, the recovery hold. The chat
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
    steps: [1, 2, 3, 4, 5, 6, 7, 8].map((position) => ({
      position,
      completedAt: null,
    })),
    paymentWindowHours: 48,
    ownerWaitDays: 7,
    now: NOW,
    ...overrides,
  };
}

function doneUpTo(last: number, at: (position: number) => Date) {
  return [1, 2, 3, 4, 5, 6, 7, 8].map((position) => ({
    position,
    completedAt: position <= last ? at(position) : null,
  }));
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

test("after the agent accepts custody, Google's owner wait runs until hold 1", () => {
  const accepted = ago(2 * DAY);
  const wait = activeWait(
    deal({ steps: doneUpTo(3, (p) => (p === 3 ? accepted : ago(3 * DAY))) }),
  );
  expect(wait).toEqual({
    label: "Google's 7-day owner wait ends",
    until: ahead(5 * DAY),
  });
});

test("after the agent transfers to the buyer, the second owner wait runs", () => {
  const transferred = ago(DAY);
  const wait = activeWait(
    deal({
      status: "AWAITING_HANDOVER",
      steps: doneUpTo(7, (p) => (p === 7 ? transferred : ago(9 * DAY))),
    }),
  );
  expect(wait?.until).toEqual(ahead(6 * DAY));
});

test("platforms without an owner wait show no owner timer", () => {
  expect(
    activeWait(deal({ ownerWaitDays: 0, steps: doneUpTo(3, () => ago(DAY)) })),
  ).toBeNull();
});

test("a Fastest deal in its recovery hold counts down to the seller's payout", () => {
  const wait = activeWait(
    deal({
      mode: "FASTEST",
      status: "AWAITING_RELEASE",
      holdUntil: ahead(3 * DAY),
      steps: doneUpTo(5, () => ago(DAY)).slice(0, 6),
    }),
  );
  expect(wait).toEqual({
    label: "Recovery hold ends, then the seller is paid",
    until: ahead(3 * DAY),
  });
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
