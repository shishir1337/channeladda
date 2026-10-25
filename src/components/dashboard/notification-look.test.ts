import {
  ArrowLeftRightIcon,
  BanknoteArrowUpIcon,
  CircleDollarSignIcon,
  WalletIcon,
} from "lucide-react";
import { expect, test } from "vitest";
import { notificationLook } from "@/components/dashboard/notification-look";
import { BALANCE_CORRECTION_BODY } from "@/lib/notification-text";

test("a balance correction is not called a payout", () => {
  // QA: "$20.00 added to your balance" was labelled "Payout".
  const look = notificationLook({
    kind: "PAYOUT",
    title: "$20.00 added to your balance",
    body: `${BALANCE_CORRECTION_BODY}: test funds.`,
  });
  expect(look.label).toBe("Balance");
  expect(look.icon).toBe(WalletIcon);
});

test("a payout is a payout", () => {
  const look = notificationLook({
    kind: "PAYOUT",
    title: "$50.00 is on its way",
    body: "Sent to your payout address.",
  });
  expect(look.label).toBe("Payout");
  expect(look.icon).toBe(BanknoteArrowUpIcon);
});

test("a deal step shows the deal icon, not money", () => {
  const look = notificationLook({
    kind: "ORDER",
    title: "Invite the agent as owner — CA-30107",
    body: "Your move.",
  });
  expect(look.label).toBe("Deal");
  expect(look.icon).toBe(ArrowLeftRightIcon);
  expect(look.icon).not.toBe(CircleDollarSignIcon);
});

test("every kind has a label", () => {
  for (const kind of [
    "MESSAGE",
    "OFFER",
    "ORDER",
    "LISTING",
    "PAYOUT",
    "DISPUTE",
    "REVIEW",
    "BADGE",
    "IDENTITY",
  ] as const) {
    expect(notificationLook({ kind, title: "", body: "" }).label).not.toBe("");
  }
});
