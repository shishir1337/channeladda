import { expect, test } from "vitest";
import { badgeValues, fillHelpText } from "@/lib/help-text";

test("the badge article states the badge as the admin has set it", () => {
  const values = badgeValues({
    resellerPointsMultiplier: 4,
    resellerDiscountBp: 2500,
  });
  expect(
    fillHelpText(
      "points count {multiplier} times — 250 becomes {multiplied250} — and fees are {discount}% lower",
      values,
    ),
  ).toBe("points count 4 times — 250 becomes 1,000 — and fees are 25% lower");
});

test("text with no placeholders comes back as it was", () => {
  expect(fillHelpText("Open a dispute from the deal page.", {})).toBe(
    "Open a dispute from the deal page.",
  );
});

test("a placeholder nobody supplied stays visible rather than vanishing", () => {
  expect(fillHelpText("{unknown} stays", {})).toBe("{unknown} stays");
});
