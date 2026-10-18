import { expect, test } from "vitest";
import { movesHeldMoney } from "@/lib/outcomes";

test("completing or refunding a deal always moves held money", () => {
  expect(movesHeldMoney("COMPLETED", true)).toBe(true);
  expect(movesHeldMoney("REFUNDED", true)).toBe(true);
});

test("returning or cancelling moves money only once something was paid", () => {
  for (const to of ["RETURNED_TO_SELLER", "CANCELLED"] as const) {
    expect(movesHeldMoney(to, true)).toBe(true);
    expect(movesHeldMoney(to, false)).toBe(false);
  }
});

test("a pause never moves money", () => {
  expect(movesHeldMoney("DISPUTED", true)).toBe(false);
});
