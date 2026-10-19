import { expect, test } from "vitest";
import { type SettingsInput, validateSettings } from "@/server/settings";

const VALID: SettingsInput = {
  buyerFeeBpSafest: 300,
  buyerFeeBpFastest: 300,
  sellerFeeBp: 0,
  maxHoldsPerAgent: 10,
  secondApprovalAbove: 5_000,
  offerExpiryHours: 48,
  minWithdrawal: 20,
  paymentWindowHours: 48,
  resellerPrice: 20,
  resellerDiscountBp: 3000,
  resellerPointsMultiplier: 3,
};

const fields = (input: SettingsInput) =>
  validateSettings(input).map((e) => e.field);

test("the documented defaults are valid", () => {
  expect(validateSettings(VALID)).toEqual([]);
});

test("each mode's buyer fee is checked separately", () => {
  expect(fields({ ...VALID, buyerFeeBpSafest: -1 })).toContain(
    "buyerFeeBpSafest",
  );
  expect(fields({ ...VALID, buyerFeeBpFastest: -1 })).toContain(
    "buyerFeeBpFastest",
  );
});

test("a fee above the ceiling is refused", () => {
  // A typo here costs real money on every sale until someone notices.
  expect(fields({ ...VALID, buyerFeeBpFastest: 9_000 })).toContain(
    "buyerFeeBpFastest",
  );
  expect(fields({ ...VALID, sellerFeeBp: 9_000 })).toContain("sellerFeeBp");
});

test("a fractional basis point is refused", () => {
  expect(fields({ ...VALID, sellerFeeBp: 12.5 })).toContain("sellerFeeBp");
});

test("a zero seller fee is allowed", () => {
  // Safest charges sellers nothing, so zero is the normal setting.
  expect(fields({ ...VALID, sellerFeeBp: 0 })).toEqual([]);
});

test("an agent must be allowed to hold at least one channel", () => {
  // Zero would freeze every assignment and read as a platform-wide outage.
  expect(fields({ ...VALID, maxHoldsPerAgent: 0 })).toContain(
    "maxHoldsPerAgent",
  );
  expect(fields({ ...VALID, maxHoldsPerAgent: 1 })).toEqual([]);
});

test("a fractional hold cap is refused", () => {
  expect(fields({ ...VALID, maxHoldsPerAgent: 2.5 })).toContain(
    "maxHoldsPerAgent",
  );
});

test("the second-approval threshold may be zero but not negative", () => {
  // Zero means every handover needs a second pair of eyes.
  expect(fields({ ...VALID, secondApprovalAbove: 0 })).toEqual([]);
  expect(fields({ ...VALID, secondApprovalAbove: -5 })).toContain(
    "secondApprovalAbove",
  );
});

test("the offer window still has to be sane", () => {
  expect(fields({ ...VALID, offerExpiryHours: 0 })).toContain(
    "offerExpiryHours",
  );
  expect(fields({ ...VALID, offerExpiryHours: 721 })).toContain(
    "offerExpiryHours",
  );
});
