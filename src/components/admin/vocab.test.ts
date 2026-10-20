import { expect, test } from "vitest";
import { custodyFacts } from "@/components/admin/vocab";

/**
 * The facts finance reads before deciding a dispute. Written for Safest
 * alone, a Fastest deal past our agent's custody read "the seller owns the
 * channel", "we are holding the price and the fee" and "refunding returns
 * all of it" — three false things, after the seller had been paid.
 */

test("a fastest deal past custody: our agent owns it and the seller has been paid", () => {
  for (const [status, facts] of [
    ["IN_CUSTODY", undefined],
    ["DISPUTED", { paid: true, inCustody: true }],
  ] as const) {
    const f = custodyFacts("FASTEST", status, facts);
    expect(f.asset).toBe("The agent owns the channel.");
    expect(f.money).toMatch(/seller has been paid/);
    expect(f.platformHolds).toBe(false);
    expect(f.recoverable).toMatch(/no refund/);
  }
});

test("a fastest deal before custody: we hold the money, the seller is still primary owner", () => {
  for (const [status, facts] of [
    ["AWAITING_HANDOVER", undefined],
    ["DISPUTED", { paid: true, inCustody: false }],
  ] as const) {
    const f = custodyFacts("FASTEST", status, facts);
    expect(f.asset).toMatch(/seller is still primary owner/);
    expect(f.money).toBe("We are holding the price and the fee.");
    expect(f.recoverable).toMatch(/returns all of it/);
  }
});

test("a safest deal reads as it did", () => {
  const f = custodyFacts("SAFEST", "IN_CUSTODY");
  expect(f.asset).toBe("The agent owns the channel.");
  expect(f.money).toMatch(/admin fee/);
});
