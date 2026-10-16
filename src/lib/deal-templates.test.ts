import { expect, test } from "vitest";
import type { DealMode, OrderStatus } from "@/generated/prisma/enums";
import { canTransition } from "@/lib/deal-machine";
import { OPENING_STATUS, templateFor } from "@/lib/deal-templates";

test("safest has nine steps in the spec's order", () => {
  const steps = templateFor("SAFEST");
  expect(steps).toHaveLength(9);
  expect(steps.map((s) => s.actor)).toEqual([
    "buyer",
    "seller",
    "agent",
    "agent",
    "buyer",
    "buyer",
    "seller",
    "agent",
    "agent",
  ]);
  expect(steps[5].label).toBe("Pay the seller directly");
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

test("the value-handing step is the one needing second approval", () => {
  expect(
    templateFor("SAFEST")
      .filter((s) => s.needsApprovalAbove)
      .map((s) => s.position),
  ).toEqual([8]);
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
      expect(
        canTransition(mode, current, step.entersStatus, step.actor),
        `step ${step.position} (${step.label}): ${current} -> ${step.entersStatus} as ${step.actor}`,
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
