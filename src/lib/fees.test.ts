import { expect, test } from "vitest";
import { orderAmounts } from "@/lib/fees";

const FEES = { buyerFeeBpSafest: 300, buyerFeeBpFastest: 300, sellerFeeBp: 0 };

test("a safest buyer owes the fee up front, and the price later", () => {
  // The up-front payment is the fee; the price is paid to us at step 6.
  const amounts = orderAmounts(10_000, FEES, "SAFEST");
  expect(amounts.totalUsd).toBe(300);
  expect(amounts.priceUsd).toBe(10_000);
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

test("the seller fee applies to safest sales", () => {
  // The price now passes through us on both kinds of deal, so there is
  // something to take the seller fee from.
  const withSellerFee = { ...FEES, sellerFeeBp: 500 };
  const safest = orderAmounts(10_000, withSellerFee, "SAFEST");
  expect(safest.sellerFeeUsd).toBe(500);
  expect(safest.payoutUsd).toBe(9_500);
  expect(safest.totalUsd).toBe(300);
  expect(orderAmounts(10_000, withSellerFee, "FASTEST").sellerFeeUsd).toBe(500);
});
