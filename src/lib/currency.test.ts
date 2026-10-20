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

test("a dollar amount always shows two decimals, a whole one too", () => {
  // The owner's call: "$0" reads as a broken figure next to "$190.10", so
  // every dollar amount has its two decimals.
  expect(formatIn(usd, 0)).toBe("$0.00");
  expect(formatIn(usd, 5)).toBe("$5.00");
  expect(formatIn(usd, 4_500)).toBe("$4,500.00");
});

test("a small converted amount shows two decimals, a whole one too", () => {
  const bdt = currencies.find((c) => c.code === "BDT");
  if (!bdt) throw new Error("BDT missing from the currency list");
  expect(formatIn(bdt, 0)).toMatch(/0\.00$/);
});

test("a dollar amount keeps its cents at any size: what is charged is what is shown", () => {
  // Found paying a Fastest deal in the browser: "You pay now $817" against a
  // price of $800 and a fee of $16.80, and a wallet reading "$190" that held
  // $190.10. Dollar amounts here are exact, so the cents are the truth.
  expect(formatIn(usd, 816.8)).toBe("$816.80");
  expect(formatIn(usd, 190.1)).toBe("$190.10");
  expect(formatIn(usd, 103.5)).toBe("$103.50");
});

test("a converted amount stays whole once it is large, as listing prices are", () => {
  // Converted figures are approximate, and a high-rate currency would show
  // a lot of noise after the point.
  const bdt = currencies.find((c) => c.code === "BDT");
  if (!bdt) throw new Error("BDT missing from the currency list");
  expect(formatIn(bdt, 816.8)).not.toMatch(/[.,]\d{2}$/);
});
