import { expect, test } from "vitest";
import { turnEmail } from "@/server/deal-notify";

/**
 * The email that reaches somebody who is not looking at the dashboard.
 *
 * A deal has two multi-day Google waits in the middle of it. Without this the
 * counterparty finds out it is their move by happening to log in, which on a
 * seven-day hold can be a week — and the notification rows the app has always
 * written are rendered nowhere at all.
 */
test("the subject says what is wanted, not that something happened", () => {
  const mail = turnEmail({
    name: "Hannah",
    reference: "CA-10001",
    listingTitle: "Monetized gaming channel",
    stepLabel: "Invite our agent as owner",
    mode: "SAFEST",
    href: "https://channeladda.com/dashboard/deals/abc",
  });

  // "Update on your deal" is what everybody's filters learn to ignore.
  expect(mail.subject).toBe("Your move: Invite our agent as owner (CA-10001)");
  expect(mail.body).toContain("Hannah");
  expect(mail.body).toContain("Monetized gaming channel");
  expect(mail.link).toBe("https://channeladda.com/dashboard/deals/abc");
});

test("it says which kind of deal, because the two work in opposite ways", () => {
  const safest = turnEmail({
    name: "Hannah",
    reference: "CA-1",
    listingTitle: "A channel",
    stepLabel: "Pay the seller directly",
    mode: "SAFEST",
    href: "https://x/y",
  });
  expect(safest.body).toContain("Safest");

  const fastest = turnEmail({
    name: "Hannah",
    reference: "CA-2",
    listingTitle: "A channel",
    stepLabel: "Confirm access received",
    mode: "FASTEST",
    href: "https://x/y",
  });
  expect(fastest.body).toContain("Fastest");
});

test("a missing name does not produce 'Hi ,'", () => {
  const mail = turnEmail({
    name: null,
    reference: "CA-3",
    listingTitle: "A channel",
    stepLabel: "Do the thing",
    mode: "FASTEST",
    href: "https://x/y",
  });
  expect(mail.body).not.toContain("Hi ,");
  expect(mail.body.startsWith("Hi there")).toBe(true);
});
