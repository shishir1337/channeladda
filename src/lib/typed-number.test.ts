import { describe, expect, test } from "vitest";
import {
  parseAmount,
  parseCount,
  parsePercent,
  UNREADABLE,
} from "@/lib/typed-number";

/**
 * Numbers as sellers and buyers type them. QA: "30,500" followers and a
 * "1,250" price were saved as 0 on a draft, and refused on a live listing
 * and on the withdraw form with "Enter an amount." — as if nothing had been
 * typed at all.
 */

describe("an amount of money", () => {
  test("plain numbers", () => {
    expect(parseAmount("1250")).toBe(1250);
    expect(parseAmount("850.50")).toBe(850.5);
    expect(parseAmount(".5")).toBe(0.5);
  });

  test("commas, a dollar sign and spaces", () => {
    expect(parseAmount("1,250")).toBe(1250);
    expect(parseAmount("$1250")).toBe(1250);
    expect(parseAmount("$20")).toBe(20);
    expect(parseAmount("1,000")).toBe(1000);
    expect(parseAmount(" $ 1,250.00 ")).toBe(1250);
    expect(parseAmount("1 250")).toBe(1250);
    expect(parseAmount("1250 USD")).toBe(1250);
    expect(parseAmount("12,34,567")).toBe(1234567);
  });

  test("a comma that is not a thousands comma is refused, not guessed", () => {
    // "1,25" is $1.25 in much of the world and $125 nowhere: never silently
    // read as either.
    expect(parseAmount("1,25")).toBeNaN();
    expect(parseAmount("12,5")).toBeNaN();
    expect(parseAmount("1.250,00")).toBeNaN();
    expect(parseAmount("1,2,3")).toBeNaN();
    expect(parseAmount(",500")).toBeNaN();
  });

  test("anything else is not a number", () => {
    expect(parseAmount("")).toBeNaN();
    expect(parseAmount("   ")).toBeNaN();
    expect(parseAmount("abc")).toBeNaN();
    expect(parseAmount("12abc")).toBeNaN();
    expect(parseAmount("1.2.3")).toBeNaN();
    expect(parseAmount("-50")).toBeNaN();
    expect(parseAmount("1e3")).toBeNaN();
  });
});

describe("a count: followers, members, years", () => {
  test("plain, with commas, with spaces", () => {
    expect(parseCount("30500")).toBe(30500);
    expect(parseCount("30,500")).toBe(30500);
    expect(parseCount("1,250")).toBe(1250);
    expect(parseCount("30 500")).toBe(30500);
    expect(parseCount(" 3,05,000 ")).toBe(305000);
    expect(parseCount("1,000,000")).toBe(1000000);
    expect(parseCount("0")).toBe(0);
  });

  test("a fraction is read, so the form can say whole numbers only", () => {
    expect(parseCount("2.5")).toBe(2.5);
  });

  test("a dollar sign is not part of a count", () => {
    expect(parseCount("$30")).toBeNaN();
  });

  test("anything else is not a number", () => {
    expect(parseCount("")).toBeNaN();
    expect(parseCount("30k")).toBeNaN();
    expect(parseCount("30,50")).toBeNaN();
    expect(parseCount("about 30000")).toBeNaN();
    expect(parseCount("-3")).toBeNaN();
  });
});

describe("a percentage", () => {
  test("plain, with a % sign, with a decimal comma", () => {
    expect(parsePercent("4.5")).toBe(4.5);
    expect(parsePercent("4.5%")).toBe(4.5);
    expect(parsePercent(" 11.2 % ")).toBe(11.2);
    expect(parsePercent("12")).toBe(12);
    // No rate reaches a thousand, so a comma here is a decimal point.
    expect(parsePercent("4,5")).toBe(4.5);
  });

  test("anything else is not a number", () => {
    expect(parsePercent("")).toBeNaN();
    expect(parsePercent("4.5.1")).toBeNaN();
    expect(parsePercent("4,5,1")).toBeNaN();
    expect(parsePercent("4,5.1")).toBeNaN();
    expect(parsePercent("high")).toBeNaN();
  });
});

test("every refusal says what to type", () => {
  for (const text of Object.values(UNREADABLE)) {
    expect(text).toMatch(/^Type /);
    expect(text).toMatch(/like /);
  }
});
