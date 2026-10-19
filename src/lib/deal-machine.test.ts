import { expect, test } from "vitest";
import type { DealMode, OrderStatus } from "@/generated/prisma/enums";
import {
  canTransition,
  type DealActor,
  isTerminal,
  TERMINAL_STATUSES,
} from "@/lib/deal-machine";

const LEGAL: [DealMode, OrderStatus, OrderStatus, DealActor][] = [
  ["SAFEST", "AWAITING_PAYMENT", "AWAITING_CUSTODY", "system"],
  ["SAFEST", "AWAITING_CUSTODY", "IN_CUSTODY", "agent"],
  ["SAFEST", "IN_CUSTODY", "AWAITING_HANDOVER", "seller"],
  ["SAFEST", "AWAITING_HANDOVER", "COMPLETED", "buyer"],
  ["SAFEST", "IN_CUSTODY", "RETURNED_TO_SELLER", "staff"],
  ["FASTEST", "AWAITING_PAYMENT", "AGENT_VERIFYING", "system"],
  ["FASTEST", "AGENT_VERIFYING", "AWAITING_HANDOVER", "buyer"],
  ["FASTEST", "AWAITING_HANDOVER", "AWAITING_RELEASE", "buyer"],
  ["FASTEST", "AWAITING_RELEASE", "COMPLETED", "agent"],
  ["FASTEST", "AWAITING_RELEASE", "REFUNDED", "staff"],
];

test.each(LEGAL)("%s allows %s to %s by %s", (mode, from, to, actor) => {
  expect(canTransition(mode, from, to, actor)).toBe(true);
});

test("only the seller says the safest price arrived", () => {
  // The buyer pays the seller directly; Channel Adda never sees the money,
  // so the seller's word is the one that releases the channel.
  for (const actor of ["buyer", "agent", "staff", "system"] as const) {
    expect(
      canTransition("SAFEST", "IN_CUSTODY", "AWAITING_HANDOVER", actor),
    ).toBe(false);
  }
});

test("only the buyer finishes a deal by confirming the channel is theirs", () => {
  expect(
    canTransition("SAFEST", "AWAITING_HANDOVER", "COMPLETED", "agent"),
  ).toBe(false);
  expect(
    canTransition("FASTEST", "AGENT_VERIFYING", "AWAITING_HANDOVER", "agent"),
  ).toBe(false);
});

test("the wrong actor cannot advance a step", () => {
  expect(
    canTransition("SAFEST", "AWAITING_CUSTODY", "IN_CUSTODY", "buyer"),
  ).toBe(false);
});

test("a mode cannot use the other mode's states", () => {
  expect(
    canTransition("FASTEST", "AWAITING_CUSTODY", "IN_CUSTODY", "agent"),
  ).toBe(false);
  expect(
    canTransition("SAFEST", "AWAITING_RELEASE", "COMPLETED", "agent"),
  ).toBe(false);
});

test("states cannot be skipped", () => {
  expect(
    canTransition("SAFEST", "AWAITING_PAYMENT", "COMPLETED", "agent"),
  ).toBe(false);
});

test("nothing leaves a terminal state", () => {
  for (const status of TERMINAL_STATUSES) {
    expect(canTransition("SAFEST", status, "AWAITING_HANDOVER", "staff")).toBe(
      false,
    );
    expect(isTerminal(status)).toBe(true);
  }
});

test("either side may dispute from any live state", () => {
  expect(canTransition("SAFEST", "IN_CUSTODY", "DISPUTED", "buyer")).toBe(true);
  expect(
    canTransition("FASTEST", "AGENT_VERIFYING", "DISPUTED", "seller"),
  ).toBe(true);
});

test("a dispute is not a dead end — staff resolve it onward", () => {
  expect(isTerminal("DISPUTED")).toBe(false);
  expect(canTransition("SAFEST", "DISPUTED", "COMPLETED", "staff")).toBe(true);
  expect(
    canTransition("SAFEST", "DISPUTED", "RETURNED_TO_SELLER", "staff"),
  ).toBe(true);
  expect(canTransition("FASTEST", "DISPUTED", "REFUNDED", "staff")).toBe(true);
});

test("only staff resolve a dispute", () => {
  expect(canTransition("SAFEST", "DISPUTED", "COMPLETED", "buyer")).toBe(false);
  expect(canTransition("FASTEST", "DISPUTED", "REFUNDED", "seller")).toBe(
    false,
  );
});

test("a channel can be returned from every state the agent holds it in", () => {
  // Otherwise a buyer who disappears mid-flow strands someone else's channel
  // with the agent forever.
  for (const from of [
    "IN_CUSTODY",
    "AWAITING_BUYER_PAYMENT",
    "AWAITING_HANDOVER",
  ] as const) {
    expect(canTransition("SAFEST", from, "RETURNED_TO_SELLER", "staff")).toBe(
      true,
    );
  }
});

test("a deal is only cancellable before anything has moved", () => {
  expect(
    canTransition("SAFEST", "AWAITING_PAYMENT", "CANCELLED", "buyer"),
  ).toBe(true);
  expect(canTransition("SAFEST", "IN_CUSTODY", "CANCELLED", "buyer")).toBe(
    false,
  );
});

test("a fastest deal is refundable wherever the platform still holds the money", () => {
  for (const from of [
    "AGENT_VERIFYING",
    "AWAITING_HANDOVER",
    "AWAITING_RELEASE",
  ] as const) {
    expect(canTransition("FASTEST", from, "REFUNDED", "staff")).toBe(true);
  }
  // A Safest deal has nothing to refund: the price never reached the platform.
  expect(canTransition("SAFEST", "IN_CUSTODY", "REFUNDED", "staff")).toBe(
    false,
  );
});

test("the sweep's own write is a transition the table knows about", () => {
  // The sweep lapses an unpaid dispute, and for a while the table said that
  // was illegal — a rule enforced in one place and contradicted in another is
  // a rule nobody can find. Both modes, because the sweep does not check.
  for (const mode of ["SAFEST", "FASTEST"] as const) {
    expect(canTransition(mode, "DISPUTED", "PAYMENT_EXPIRED", "system")).toBe(
      true,
    );
    // Still nobody else's to make.
    expect(canTransition(mode, "DISPUTED", "PAYMENT_EXPIRED", "buyer")).toBe(
      false,
    );
    expect(canTransition(mode, "DISPUTED", "PAYMENT_EXPIRED", "staff")).toBe(
      false,
    );
  }
});
