import { expect, test } from "vitest";
import { balanceRoute } from "@/lib/pay-options";

test("a covered amount pays from the balance", () => {
  expect(balanceRoute(10_300, 10_300)).toEqual({ kind: "balance" });
  expect(balanceRoute(50_000, 10_000)).toEqual({ kind: "balance" });
});

test("a short balance tops up exactly the difference", () => {
  expect(balanceRoute(100_000, 515_000)).toEqual({
    kind: "top-up",
    topUpUsd: 415_000,
  });
});

test("a tiny shortfall tops up the $10 minimum", () => {
  expect(balanceRoute(9_900, 10_000)).toEqual({
    kind: "top-up",
    topUpUsd: 1_000,
  });
});

test("an empty balance or a shortfall over $10,000 pays by invoice only", () => {
  expect(balanceRoute(0, 10_000)).toEqual({ kind: "invoice-only" });
  expect(balanceRoute(100, 2_000_000)).toEqual({ kind: "invoice-only" });
});
