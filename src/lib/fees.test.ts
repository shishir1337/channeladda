import { expect, test } from "vitest";
import { DEFAULT_FEES, orderAmounts } from "@/lib/fees";

const FEES = { buyerFeeBpSafest: 300, buyerFeeBpFastest: 300, sellerFeeBp: 0 };

test("a safest buyer pays channel adda the fee and nothing else", () => {
  // The price goes from the buyer to the seller directly, at step 6.
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

test("the seller fee applies only to fastest sales", () => {
  // A Safest price never passes through Channel Adda, so there is nothing
  // to take a seller fee from: the seller receives the whole price.
  const withSellerFee = { ...FEES, sellerFeeBp: 500 };
  const safest = orderAmounts(10_000, withSellerFee, "SAFEST");
  expect(safest.sellerFeeUsd).toBe(0);
  expect(safest.payoutUsd).toBe(10_000);
  expect(safest.totalUsd).toBe(300);
  expect(orderAmounts(10_000, withSellerFee, "FASTEST").sellerFeeUsd).toBe(500);
});

test("a fresh site charges the buyer 5% on either deal, and the seller nothing", () => {
  // The owner, 2026-10-26: 3% became 5%.
  expect(DEFAULT_FEES).toEqual({
    buyerFeeBpSafest: 500,
    buyerFeeBpFastest: 500,
    sellerFeeBp: 0,
  });
  expect(orderAmounts(10_000, DEFAULT_FEES, "SAFEST").totalUsd).toBe(500);
});
