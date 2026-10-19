import { expect, test } from "vitest";
import type { DealMode, OrderStatus } from "@/generated/prisma/enums";
import { canTransition } from "@/lib/deal-machine";
import { OPENING_STATUS, templateFor } from "@/lib/deal-templates";

test("safest has the nine steps the client confirmed, in order", () => {
  const steps = templateFor("SAFEST");
  expect(steps.map((s) => [s.label, s.actor])).toEqual([
    ["Pay the admin fee", "buyer"],
    ["Add the agent as manager", "seller"],
    ["Confirm manager access", "agent"],
    ["Make the agent primary owner", "seller"],
    ["Confirm primary ownership", "agent"],
    ["Pay the seller", "buyer"],
    ["Confirm the payment arrived", "seller"],
    ["Make the buyer the owner", "agent"],
    ["Confirm ownership received", "buyer"],
  ]);
});

test("fastest has the six steps the client confirmed, in order", () => {
  const steps = templateFor("FASTEST");
  expect(steps.map((s) => [s.label, s.actor])).toEqual([
    ["Pay the full amount", "buyer"],
    ["Add the buyer as manager", "seller"],
    ["Confirm manager access", "buyer"],
    ["Make the buyer primary owner", "seller"],
    ["Confirm primary ownership", "buyer"],
    ["Release the seller's funds", "agent"],
  ]);
});

test("each mode has one hold, started by the manager access being confirmed", () => {
  // Safest: Google's wait before our agent can be made primary owner.
  // Fastest: the holding period before the buyer is made primary owner.
  for (const mode of ["SAFEST", "FASTEST"] as const) {
    expect(
      templateFor(mode)
        .filter((s) => s.startsHold)
        .map((s) => s.label),
    ).toEqual(["Confirm manager access"]);
  }
});

test("the buyer's account is first used by the step that adds it to the channel", () => {
  // Until then the buyer may still correct it.
  expect(
    templateFor("SAFEST")
      .filter((s) => s.usesHandover)
      .map((s) => s.position),
  ).toEqual([8]);
  expect(
    templateFor("FASTEST")
      .filter((s) => s.usesHandover)
      .map((s) => s.position),
  ).toEqual([2]);
});

test("the irreversible handover is the step that gives the channel to the buyer", () => {
  expect(
    templateFor("SAFEST")
      .filter((s) => s.handsOver)
      .map((s) => s.position),
  ).toEqual([8]);
  expect(
    templateFor("FASTEST")
      .filter((s) => s.handsOver)
      .map((s) => s.position),
  ).toEqual([4]);
});

test("positions are 1..n with no gaps", () => {
  for (const mode of ["SAFEST", "FASTEST"] as const) {
    const positions = templateFor(mode).map((s) => s.position);
    expect(positions).toEqual(positions.map((_, i) => i + 1));
  }
});

test("the steps that hand value across need a second approval above the threshold", () => {
  // Safest: our agent giving the channel to the buyer. Fastest: Channel
  // Adda paying the seller.
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

test("no step is completed by a payment other than the opening one", () => {
  // Channel Adda takes one payment per deal: the Safest admin fee, or the
  // whole Fastest amount. A Safest buyer pays the price to the seller.
  for (const mode of ["SAFEST", "FASTEST"] as const) {
    expect(templateFor(mode).some((s) => "byPayment" in s)).toBe(false);
  }
});

test("labels are distinct within a mode", () => {
  for (const mode of ["SAFEST", "FASTEST"] as const) {
    const labels = templateFor(mode).map((s) => s.label);
    expect(new Set(labels).size).toBe(labels.length);
  }
});
