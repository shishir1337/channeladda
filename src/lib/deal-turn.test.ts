import { describe, expect, test } from "vitest";
import {
  awaitingOf,
  dealTurn,
  isMoveOf,
  payToMissingOn,
  type TurnInput,
} from "@/lib/deal-turn";

// QA, CA-27058: on a Safest deal at "You pay the seller", with no payment
// details from the seller, the buyer's page said "Pay the seller now" and
// "Your move", their dashboard "Waiting on you", our agent's "Waiting on
// the buyer" — and the seller's dashboard "You are all caught up".

const now = new Date("2026-10-26T06:00:00Z");

const paySeller: TurnInput = {
  mode: "SAFEST",
  status: "IN_CUSTODY",
  next: { position: 6, label: "Pay the seller", actor: "buyer" },
  holdUntil: null,
  agentId: "agent-1",
  sellerPayTo: null,
  now,
};

describe("whose move it is", () => {
  test("with no payment details, paying the seller is the seller's move", () => {
    const turn = dealTurn(paySeller);
    expect(turn).toEqual({ kind: "move", actor: "seller", payTo: true });
    expect(isMoveOf(turn, "seller")).toBe(true);
    expect(isMoveOf(turn, "buyer")).toBe(false);
    expect(awaitingOf(turn)).toBe("seller");
    expect(payToMissingOn(paySeller)).toBe(true);
  });

  test("once the seller says where, it is the buyer's", () => {
    const input = { ...paySeller, sellerPayTo: "bKash 01700000000" };
    expect(dealTurn(input)).toEqual({
      kind: "move",
      actor: "buyer",
      payTo: false,
    });
    expect(payToMissingOn(input)).toBe(false);
    // Blank is not details.
    expect(payToMissingOn({ ...paySeller, sellerPayTo: "   " })).toBe(true);
  });

  test("a dispute is nobody's move but Channel Adda's", () => {
    const turn = dealTurn({ ...paySeller, status: "DISPUTED" });
    expect(turn).toEqual({ kind: "paused" });
    expect(awaitingOf(turn)).toBe("staff");
    expect(payToMissingOn({ ...paySeller, status: "DISPUTED" })).toBe(false);
  });

  test("a running hold is nobody's move", () => {
    const until = new Date(now.getTime() + 86_400_000);
    const turn = dealTurn({
      mode: "FASTEST",
      status: "AWAITING_HANDOVER",
      next: {
        position: 4,
        label: "Make the agent primary owner",
        actor: "seller",
      },
      holdUntil: until,
      agentId: "agent-1",
      sellerPayTo: null,
      now,
    });
    expect(turn).toEqual({ kind: "held", until });
    expect(awaitingOf(turn)).toBeNull();
  });

  test("the seller's first step waits for an agent to be assigned", () => {
    expect(
      dealTurn({
        mode: "FASTEST",
        status: "AGENT_VERIFYING",
        next: {
          position: 2,
          label: "Invite the agent as owner",
          actor: "seller",
        },
        holdUntil: null,
        agentId: null,
        sellerPayTo: null,
        now,
      }),
    ).toEqual({ kind: "assigning" });
  });

  test("an ended deal, and a Fastest deal, have no payment details to wait for", () => {
    expect(dealTurn({ ...paySeller, status: "CANCELLED" })).toEqual({
      kind: "none",
    });
    expect(payToMissingOn({ ...paySeller, status: "CANCELLED" })).toBe(false);
    expect(payToMissingOn({ ...paySeller, mode: "FASTEST" })).toBe(false);
  });
});
