import { describe, expect, it } from "vitest";
import { exactUsd, overMaximum } from "@/lib/exact-usd";

describe("exactUsd", () => {
  it("shows cents exactly, with the site's dollar sign", () => {
    expect(exactUsd(5_000)).toBe("$50.00");
    expect(exactUsd(123_456)).toBe("$1,234.56");
    expect(exactUsd(0)).toBe("$0.00");
    expect(exactUsd(-2_050)).toBe("−$20.50");
    expect(exactUsd(5_000)).not.toContain("US$");
  });
});

describe("overMaximum", () => {
  it("states the limit plainly, either way", () => {
    expect(overMaximum(true, 10_000_000)).toBe(
      "The most one correction can add is $100,000.00.",
    );
    expect(overMaximum(false, 10_000_000)).toBe(
      "The most one correction can take is $100,000.00.",
    );
    expect(overMaximum(true, 10_000_000)).not.toMatch(/split/i);
  });
});
