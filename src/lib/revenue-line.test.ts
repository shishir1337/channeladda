import { expect, test } from "vitest";
import { revenueLine } from "@/lib/revenue-line";

test("a monetized account with revenue shows its monthly figure", () => {
  expect(revenueLine({ monetized: true, monthlyRevenue: 1470 })).toEqual({
    kind: "revenue",
    usd: 1470,
  });
});

test("a monetized account with no revenue entered is still monetized", () => {
  // The listing form says zero is normal, and the listing page's badge
  // says Monetized; the card used to say the opposite.
  expect(revenueLine({ monetized: true, monthlyRevenue: 0 })).toEqual({
    kind: "monetized",
  });
});

test("an account that is not monetized says so", () => {
  expect(revenueLine({ monetized: false, monthlyRevenue: 0 })).toEqual({
    kind: "none",
  });
});
