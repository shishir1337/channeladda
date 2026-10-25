import { expect, test } from "vitest";
import { notificationLook } from "@/components/dashboard/notification-look";
import {
  EMAIL_CHANGED,
  isSecurityNotice,
  PASSWORD_CHANGED,
  PAYOUT_ADDRESS_CHANGED,
} from "@/lib/security-notices";

test("a change to the account's keys reads as Security in the bell", () => {
  for (const [kind, title] of [
    ["IDENTITY", PASSWORD_CHANGED],
    ["IDENTITY", `${EMAIL_CHANGED} to n***@example.com`],
    ["PAYOUT", PAYOUT_ADDRESS_CHANGED],
  ] as const) {
    expect(notificationLook({ kind, title, body: "" }).label).toBe("Security");
  }
  // And nothing else does.
  expect(isSecurityNotice("$40.00 is on its way")).toBe(false);
  expect(
    notificationLook({ kind: "IDENTITY", title: "You're verified", body: "" })
      .label,
  ).toBe("Verification");
});
