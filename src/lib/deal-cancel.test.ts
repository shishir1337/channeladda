import { expect, test } from "vitest";
import { memberMayCancel } from "@/lib/deal-cancel";

// Offered to the buyer and the seller only where the server will accept it:
// before payment, or after it while the seller has pressed nothing.

const step = (actor: "buyer" | "seller" | "agent", done: boolean) => ({
  actor,
  completedAt: done ? new Date() : null,
});

test("an unpaid deal can be cancelled by either side", () => {
  for (const mode of ["SAFEST", "FASTEST"] as const) {
    expect(
      memberMayCancel({ mode, status: "AWAITING_PAYMENT", steps: [] }),
    ).toBe(true);
  }
});

test("a paid deal can be cancelled until the seller presses their first step", () => {
  const paid = [step("buyer", true), step("seller", false)];
  expect(
    memberMayCancel({
      mode: "SAFEST",
      status: "AWAITING_CUSTODY",
      steps: paid,
    }),
  ).toBe(true);
  expect(
    memberMayCancel({
      mode: "FASTEST",
      status: "AGENT_VERIFYING",
      steps: paid,
    }),
  ).toBe(true);

  const invited = [step("buyer", true), step("seller", true)];
  expect(
    memberMayCancel({
      mode: "SAFEST",
      status: "AWAITING_CUSTODY",
      steps: invited,
    }),
  ).toBe(false);
  expect(
    memberMayCancel({
      mode: "FASTEST",
      status: "AGENT_VERIFYING",
      steps: invited,
    }),
  ).toBe(false);
});

test("later in a deal, or once it has ended, there is no cancel", () => {
  for (const status of [
    "IN_CUSTODY",
    "AWAITING_HANDOVER",
    "DISPUTED",
    "COMPLETED",
    "CANCELLED",
  ] as const) {
    expect(memberMayCancel({ mode: "FASTEST", status, steps: [] })).toBe(false);
  }
});
