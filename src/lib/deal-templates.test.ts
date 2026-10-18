import { expect, test } from "vitest";
import type { DealMode, OrderStatus } from "@/generated/prisma/enums";
import { canTransition } from "@/lib/deal-machine";
import { OPENING_STATUS, templateFor } from "@/lib/deal-templates";

test("safest has eight steps in the spec's order", () => {
  const steps = templateFor("SAFEST");
  expect(steps.map((s) => [s.label, s.actor])).toEqual([
    ["Pay the admin fee", "buyer"],
    ["Invite the agent as channel owner", "seller"],
    ["Accept and confirm custody", "agent"],
    ["Hold 1 complete, ownership verified", "agent"],
    ["Inspect the channel", "buyer"],
    ["Pay the price to Channel Adda", "buyer"],
    ["Transfer ownership to the buyer", "agent"],
    ["Hold 2 complete, ownership verified", "agent"],
  ]);
});

test("the safest price is paid at checkout, never marked done by hand", () => {
  const steps = templateFor("SAFEST");
  expect(steps.filter((s) => s.byPayment).map((s) => s.position)).toEqual([6]);
  expect(templateFor("FASTEST").some((s) => s.byPayment)).toBe(false);
});

test("fastest has six steps in the spec's order", () => {
  const steps = templateFor("FASTEST");
  expect(steps).toHaveLength(6);
  expect(steps.map((s) => s.actor)).toEqual([
    "buyer",
    "seller",
    "agent",
    "seller",
    "buyer",
    "agent",
  ]);
});

test("positions are 1..n with no gaps", () => {
  for (const mode of ["SAFEST", "FASTEST"] as const) {
    const positions = templateFor(mode).map((s) => s.position);
    expect(positions).toEqual(positions.map((_, i) => i + 1));
  }
});

test("both safest transfer steps need a second approval above the threshold", () => {
  // The transfer hands the channel over, and Hold 2 completing releases the
  // price to the seller: both hand value to the other side.
  expect(
    templateFor("SAFEST")
      .filter((s) => s.needsApprovalAbove)
      .map((s) => s.position),
  ).toEqual([7, 8]);
  expect(
    templateFor("FASTEST")
      .filter((s) => s.needsApprovalAbove)
      .map((s) => s.position),
  ).toEqual([6]);
});

test("the opening payment step never moves the status itself", () => {
  // Recording the payment is what advances the order, as the system, so a
  // template that also claimed the transition would do it twice.
  for (const mode of ["SAFEST", "FASTEST"] as const) {
    expect(templateFor(mode)[0].entersStatus).toBeUndefined();
  }
});

test.each(["SAFEST", "FASTEST"] as const)(
  "every %s step transition is legal for that step's actor",
  (mode: DealMode) => {
    let current: OrderStatus = OPENING_STATUS[mode];
    for (const step of templateFor(mode)) {
      if (!step.entersStatus) continue;
      // A step completed by a payment arriving moves the deal as the system.
      const by = step.byPayment ? "system" : step.actor;
      expect(
        canTransition(mode, current, step.entersStatus, by),
        `step ${step.position} (${step.label}): ${current} -> ${step.entersStatus} as ${by}`,
      ).toBe(true);
      current = step.entersStatus;
    }
    expect(current).toBe("COMPLETED");
  },
);

test("each mode opens on the status its cleared payment leads to", () => {
  expect(OPENING_STATUS.SAFEST).toBe("AWAITING_CUSTODY");
  expect(OPENING_STATUS.FASTEST).toBe("AGENT_VERIFYING");
});

test("labels are distinct within a mode", () => {
  for (const mode of ["SAFEST", "FASTEST"] as const) {
    const labels = templateFor(mode).map((s) => s.label);
    expect(new Set(labels).size).toBe(labels.length);
  }
});
