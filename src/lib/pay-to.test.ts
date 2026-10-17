import { expect, test } from "vitest";
import { hasPayToLink, MAX_PAY_TO, payToVisibleTo } from "@/lib/pay-to";

test("the seller, the agent and staff see the details from the start", () => {
  for (const viewer of ["seller", "agent", "staff"] as const) {
    expect(payToVisibleTo(viewer, false)).toBe(true);
    expect(payToVisibleTo(viewer, true)).toBe(true);
  }
});

test("the buyer sees them only once it is their turn to pay the seller", () => {
  // Before that the channel is not yet in custody, and the details would be
  // a way to take the deal off the platform.
  expect(payToVisibleTo("buyer", false)).toBe(false);
  expect(payToVisibleTo("buyer", true)).toBe(true);
  expect(payToVisibleTo("system", true)).toBe(false);
});

test.each([
  "Pay me at https://pay.example.com/abc",
  "http://pay.example.com",
  "www.paymentpage.com",
  "WWW.PAYMENTPAGE.COM",
  "message me on t.me/dealer",
  "wa.me/8801712345678",
  "discord.gg/abcd",
  "join.skype.com/abc",
])("a link is refused: %s", (text) => {
  expect(hasPayToLink(text)).toBe(true);
});

test.each([
  "PayPal: name@paypal.com",
  "USDT (TRC20): TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE",
  "Bank: Dutch-Bangla Bank, A/C 123 456 7890 12, Nadia Rahman",
  "bKash 01712345678",
])("ordinary payment details are not links: %s", (text) => {
  expect(hasPayToLink(text)).toBe(false);
});

test("the limit is 500 characters", () => {
  expect(MAX_PAY_TO).toBe(500);
});
