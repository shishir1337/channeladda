import { expect, test } from "vitest";
import type { DealMode, OrderStatus } from "@/generated/prisma/enums";
import { canTransition } from "@/lib/deal-machine";
import {
  awaitsAgent,
  OPENING_STATUS,
  templateFor,
  usesCurrentSteps,
} from "@/lib/deal-templates";

test("a deal seeded with the steps of an earlier template is told apart", () => {
  // A deal's steps are written when it is opened, so one opened before the
  // client's flows of 2026-10-20 still carries the old ones and cannot be
  // run under the new.
  const current = templateFor("SAFEST").map((s) => s.label);
  expect(usesCurrentSteps("SAFEST", current)).toBe(true);
  expect(
    usesCurrentSteps("SAFEST", [
      "Pay the admin fee",
      "Invite the agent as channel owner",
      "Accept and confirm custody",
      "Hold 1 complete, ownership verified",
      "Inspect the channel",
      "Pay the price to Channel Adda",
      "Transfer ownership to the buyer",
      "Hold 2 complete, ownership verified",
    ]),
  ).toBe(false);
  // The same labels in another order is still the wrong template.
  expect(
    usesCurrentSteps(
      "FASTEST",
      templateFor("FASTEST")
        .map((s) => s.label)
        .reverse(),
    ),
  ).toBe(false);
});

test("safest has the owner's eight steps, in order", () => {
  // The owner's final process of 2026-10-20: the seller gives our agent
  // owner access, the 7-day wait, our agent verifies the channel, the buyer
  // pays the seller directly, and once the seller confirms it our agent
  // transfers ownership to the buyer. Our agent has to be primary owner to
  // transfer it, which YouTube allows only after those 7 days.
  const steps = templateFor("SAFEST");
  expect(steps.map((s) => [s.label, s.actor])).toEqual([
    ["Pay the admin fee", "buyer"],
    ["Invite the agent as owner", "seller"],
    ["Accept the owner invite", "agent"],
    ["Make the agent primary owner", "seller"],
    ["Verify the channel", "agent"],
    ["Pay the seller", "buyer"],
    ["Confirm the payment arrived", "seller"],
    ["Transfer ownership to the buyer", "agent"],
  ]);
});

test("fastest has the owner's six steps, in order", () => {
  // The owner's final process of 2026-10-20: the seller invites our agent
  // as owner, our agent invites the buyer, the holding period runs, the
  // seller makes our agent primary owner — which pays the seller — and our
  // agent makes the buyer primary owner.
  const steps = templateFor("FASTEST");
  expect(steps.map((s) => [s.label, s.actor])).toEqual([
    ["Pay the full amount", "buyer"],
    ["Invite the agent as owner", "seller"],
    ["Invite the buyer as owner", "agent"],
    ["Make the agent primary owner", "seller"],
    ["Confirm primary ownership", "agent"],
    ["Make the buyer primary owner", "agent"],
  ]);
});

test("each mode has one hold, started by our agent's third step", () => {
  // Safest: Google's wait before our agent can be made primary owner.
  // Fastest: the holding period, which starts when our agent invites the
  // buyer and is also the agent's own wait to become primary owner.
  expect(
    templateFor("SAFEST")
      .filter((s) => s.startsHold)
      .map((s) => s.label),
  ).toEqual(["Accept the owner invite"]);
  expect(
    templateFor("FASTEST")
      .filter((s) => s.startsHold)
      .map((s) => s.label),
  ).toEqual(["Invite the buyer as owner"]);
});

test("fastest pays the seller once our agent is primary owner, not at the end", () => {
  // "Primary ownership received by the escrow agent: deal complete, seller
  // paid." The channel is out of the seller's hands by then.
  expect(
    templateFor("FASTEST")
      .filter((s) => s.paysSeller)
      .map((s) => s.position),
  ).toEqual([5]);
  expect(templateFor("SAFEST").some((s) => s.paysSeller)).toBe(false);
});

test("the seller's step that brings our agent in needs an agent on the deal", () => {
  for (const mode of ["SAFEST", "FASTEST"] as const) {
    expect(
      templateFor(mode)
        .filter((s) => s.needsAgent)
        .map((s) => s.position),
    ).toEqual([2]);
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
  ).toEqual([3]);
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
  ).toEqual([6]);
});

test("positions are 1..n with no gaps", () => {
  for (const mode of ["SAFEST", "FASTEST"] as const) {
    const positions = templateFor(mode).map((s) => s.position);
    expect(positions).toEqual(positions.map((_, i) => i + 1));
  }
});

test("the steps that hand value across need a second approval above the threshold", () => {
  // Safest: our agent giving the channel to the buyer. Fastest: Channel
  // Adda paying the seller, and our agent giving the channel to the buyer.
  expect(
    templateFor("SAFEST")
      .filter((s) => s.needsApprovalAbove)
      .map((s) => s.position),
  ).toEqual([8]);
  expect(
    templateFor("FASTEST")
      .filter((s) => s.needsApprovalAbove)
      .map((s) => s.position),
  ).toEqual([5, 6]);
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

test("a step waits for Channel Adda only while it needs an agent and has none", () => {
  for (const mode of ["SAFEST", "FASTEST"] as const) {
    expect(awaitsAgent(mode, 2, null)).toBe(true);
    expect(awaitsAgent(mode, 2, "agent-1")).toBe(false);
    expect(awaitsAgent(mode, 3, null)).toBe(false);
    expect(awaitsAgent(mode, null, null)).toBe(false);
  }
});
