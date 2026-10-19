import { expect, test } from "vitest";
import { keptFee, requiredHold } from "@/lib/holds";

const order = {
  mode: "SAFEST" as const,
  paymentRef: "pay-1",
  totalUsd: 300,
  buyerFeeUsd: 300,
  priceUsd: 10_000,
  buyerPaidAt: null,
  custodyAt: null,
};

test("nothing is held before payment", () => {
  expect(requiredHold({ ...order, paymentRef: null })).toBe(0);
  expect(
    requiredHold({
      ...order,
      mode: "FASTEST",
      totalUsd: 10_300,
      paymentRef: null,
    }),
  ).toBe(0);
});

test("fastest holds the total", () => {
  expect(requiredHold({ ...order, mode: "FASTEST", totalUsd: 10_300 })).toBe(
    10_300,
  );
});

test("safest holds the fee", () => {
  expect(requiredHold(order)).toBe(300);
});

test("safest holds only the fee, even once the buyer has paid the seller", () => {
  // buyerPaidAt is the buyer saying they paid the seller directly: none of
  // that money is ours to hold.
  const paidTheSeller = { ...order, buyerPaidAt: new Date() };
  expect(requiredHold(paidTheSeller)).toBe(300);
});

test("safest keeps its fee once custody is reached", () => {
  expect(keptFee(order)).toBe(0);
  expect(keptFee({ ...order, custodyAt: new Date() })).toBe(300);
  // Fastest never stamps custody, and never keeps a fee on a deal that
  // did not happen.
  expect(keptFee({ ...order, mode: "FASTEST", custodyAt: new Date() })).toBe(0);
});
