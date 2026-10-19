import { expect, test } from "vitest";
import {
  nextPassPeriod,
  RESELLER_DAYS,
  ratingPoints,
  withResellerDiscount,
} from "@/lib/reseller";

// The owner's rules, 2026-10-20: a $500 deal earns 250 points; the Reseller
// badge triples them while it is active and takes 30% off every fee.

const DAY = 86_400_000;

test("a deal earns half its worth in points", () => {
  expect(ratingPoints({ worthCents: 50_000, multiplier: 1 })).toBe(250);
  // Whole points only, rounded down: $1.99 of deals is not a point.
  expect(ratingPoints({ worthCents: 199, multiplier: 1 })).toBe(0);
  expect(ratingPoints({ worthCents: 0, multiplier: 1 })).toBe(0);
});

test("the badge multiplies what has been earned, not only what comes next", () => {
  expect(ratingPoints({ worthCents: 50_000, multiplier: 3 })).toBe(750);
});

test("the discount takes 30% off a fee rate, and nothing without the badge", () => {
  const fees = {
    buyerFeeBpSafest: 300,
    buyerFeeBpFastest: 500,
    sellerFeeBp: 200,
  };
  expect(
    withResellerDiscount(fees, { buyer: true, seller: false }, 3000),
  ).toEqual({
    buyerFeeBpSafest: 210,
    buyerFeeBpFastest: 350,
    sellerFeeBp: 200,
  });
  expect(
    withResellerDiscount(fees, { buyer: false, seller: true }, 3000),
  ).toEqual({
    buyerFeeBpSafest: 300,
    buyerFeeBpFastest: 500,
    sellerFeeBp: 140,
  });
  expect(
    withResellerDiscount(fees, { buyer: false, seller: false }, 3000),
  ).toEqual(fees);
});

test("a pass lasts thirty days from now, or from the end of the one running", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  expect(nextPassPeriod(null, now)).toEqual({
    startsAt: now,
    endsAt: new Date(now.getTime() + RESELLER_DAYS * DAY),
  });
  // Paying early extends: it never overlaps or cuts the running pass short.
  const running = new Date(now.getTime() + 5 * DAY);
  expect(nextPassPeriod(running, now)).toEqual({
    startsAt: running,
    endsAt: new Date(running.getTime() + RESELLER_DAYS * DAY),
  });
  // A pass that lapsed starts fresh from now.
  expect(nextPassPeriod(new Date(now.getTime() - DAY), now).startsAt).toEqual(
    now,
  );
});
