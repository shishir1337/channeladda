import { expect, test } from "vitest";
import { orderAmounts } from "@/lib/fees";

const FEES = { buyerFeeBpSafest: 300, buyerFeeBpFastest: 300, sellerFeeBp: 0 };

test("safest buyer owes the fee alone, never the price", () => {
  expect(orderAmounts(10_000, FEES, "SAFEST").totalUsd).toBe(300);
});

test("fastest buyer owes price plus fee", () => {
  expect(orderAmounts(10_000, FEES, "FASTEST").totalUsd).toBe(10_300);
});

test("fee rounds in cents, not dollars", () => {
  expect(orderAmounts(9_900, FEES, "SAFEST").buyerFeeUsd).toBe(297);
});

test("each mode reads its own rate", () => {
  const split = { ...FEES, buyerFeeBpFastest: 500 };
  expect(orderAmounts(10_000, split, "SAFEST").buyerFeeUsd).toBe(300);
  expect(orderAmounts(10_000, split, "FASTEST").buyerFeeUsd).toBe(500);
});

test("safest never charges a seller fee", () => {
  const withSellerFee = { ...FEES, sellerFeeBp: 500 };
  expect(orderAmounts(10_000, withSellerFee, "SAFEST").sellerFeeUsd).toBe(0);
  expect(orderAmounts(10_000, withSellerFee, "FASTEST").sellerFeeUsd).toBe(500);
});
