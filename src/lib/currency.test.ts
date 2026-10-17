import { expect, test } from "vitest";
import { currencies, formatIn } from "@/lib/currency";

const usd = currencies.find((c) => c.code === "USD");
if (!usd) throw new Error("USD missing from the currency list");

test("a small fee is shown with its cents, not rounded to nothing", () => {
  // Every price rendered to whole units, so a $10 listing's Safest panel
  // read "Up front you pay our fee only: $0" — and the buyer was then
  // invoiced $0.30. fees.ts stopped rounding the fee because it reaches a
  // charge; the display kept rounding it.
  expect(formatIn(usd, 0.3)).toBe("$0.30");
  expect(formatIn(usd, 2.97)).toBe("$2.97");
});

test("a whole amount is not given cents it does not have", () => {
  expect(formatIn(usd, 5)).toBe("$5");
  expect(formatIn(usd, 4_500)).toBe("$4,500");
});

test("large amounts stay whole, as listing prices are", () => {
  expect(formatIn(usd, 103.5)).toBe("$104");
});
