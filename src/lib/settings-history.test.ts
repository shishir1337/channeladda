import { expect, test } from "vitest";
import { settingsDiff } from "@/lib/settings-history";

test("bookkeeping columns are not changes, and names are plain", () => {
  // QA: the history showed "updatedById", "googleReviewUrl" and a user id.
  const diff = settingsDiff(
    {
      id: "singleton",
      buyerFeeBpSafest: 300,
      googleReviewUrl: null,
      paymentWindowHours: 48,
      updatedById: "cmuser1",
      updatedAt: "2026-10-25T10:00:00.000Z",
    },
    {
      id: "singleton",
      buyerFeeBpSafest: 250,
      googleReviewUrl: "https://g.page/r/abc/review",
      paymentWindowHours: 24,
      updatedById: "cmuser2",
      updatedAt: "2026-10-26T10:00:00.000Z",
    },
  );
  expect(diff).toEqual([
    {
      key: "buyerFeeBpSafest",
      label: "Buyer fee, Safest",
      from: "3%",
      to: "2.5%",
    },
    {
      key: "googleReviewUrl",
      label: "Google review link",
      from: "not set",
      to: "https://g.page/r/abc/review",
    },
    {
      key: "paymentWindowHours",
      label: "Payment window",
      from: "48 hours",
      to: "24 hours",
    },
  ]);
});

test("every setting a superadmin can change has a plain name", () => {
  const keys = [
    "buyerFeeBpSafest",
    "buyerFeeBpFastest",
    "sellerFeeBp",
    "maxHoldsPerAgent",
    "secondApprovalAboveUsd",
    "offerExpiryHours",
    "minWithdrawalUsd",
    "paymentWindowHours",
    "resellerPriceUsd",
    "resellerDiscountBp",
    "resellerPointsMultiplier",
    "googleReviewUrl",
  ];
  for (const key of keys) {
    const [row] = settingsDiff({ [key]: 1 }, { [key]: 2 });
    expect(row.label).not.toBe(key);
  }
});

test("money and multipliers read as money and multipliers", () => {
  const diff = settingsDiff(
    { minWithdrawalUsd: 2_000, resellerPointsMultiplier: 3 },
    { minWithdrawalUsd: 5_000, resellerPointsMultiplier: 4 },
  );
  expect(diff.map((d) => [d.from, d.to])).toEqual([
    ["$20.00", "$50.00"],
    ["3×", "4×"],
  ]);
});
