import { expect, test } from "vitest";
import { ENDINGS, undoLine } from "@/lib/deal-endings";

// The staff desk spells out what each ending does before finance picks one.
// On Safest we never hold the price, and the desk used to say we did — so a
// decision meant to pay the seller paid nobody, and one meant to refund the
// buyer refunded nothing.

const consequence = (to: string) =>
  ENDINGS.find((ending) => ending.to === to)?.consequence("SAFEST") ?? "";

test("no Safest ending promises to pay or refund the price", () => {
  for (const ending of ENDINGS) {
    const text = ending.consequence("SAFEST");
    expect(text, ending.to).not.toMatch(/price to the seller's wallet/i);
    expect(text, ending.to).not.toMatch(/refunds whatever we are holding/i);
  }
  expect(consequence("COMPLETED")).toMatch(/never held the price/);
  expect(consequence("RETURNED_TO_SELLER")).toMatch(/never held the price/);
});

test("finishing a Safest deal says the channel goes to the buyer", () => {
  expect(consequence("COMPLETED")).toMatch(/to the buyer/);
  const completed = ENDINGS.find((ending) => ending.to === "COMPLETED");
  expect(completed?.label).not.toMatch(/seller's favour/);
});

test("the desk's line about what cannot be undone counts what it shows", () => {
  // QA: a disputed deal is not offered the pause again, and the panel still
  // said "Four of these five cannot be undone" above four options.
  expect(undoLine(ENDINGS)).toBe("Four of these five cannot be undone.");
  const paused = ENDINGS.filter((ending) => ending.to !== "DISPUTED");
  expect(undoLine(paused)).toBe("None of these can be undone.");
});
