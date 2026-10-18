import { describe, expect, test } from "vitest";
import {
  dealHeadline,
  moneyNote,
  STATUS_LABELS,
  STATUS_SHORT,
  statusSentence,
} from "@/components/deals/deal-status";

test("on a safest deal the money note says Channel Adda holds the price", () => {
  for (const viewer of ["buyer", "seller", "agent"] as const) {
    const note = moneyNote("SAFEST", viewer);
    expect(note).toMatch(/Channel Adda/);
    expect(note).not.toMatch(/directly|never holds|off the platform/);
  }
  expect(moneyNote("SAFEST", "seller")).toMatch(/your Channel Adda wallet/);
});

test("a finished safest sale tells the seller where the money went", () => {
  const seller = statusSentence("COMPLETED", "SAFEST", "seller");
  expect(seller).toMatch(/your Channel Adda wallet/);
  expect(seller).not.toMatch(/directly/);
});

/**
 * Found walking a whole Safest deal in the browser: once the seller had
 * invited the agent, the seller's own page still said "Waiting for the
 * seller to hand the channel over" and told them to invite the agent — the
 * status spans three steps, and the headline only knew the status.
 */
describe("the headline follows whose step is open, not just the status", () => {
  test("after the seller invites the agent, nobody is told the seller still has to", () => {
    for (const viewer of ["buyer", "seller", "agent"] as const) {
      const h = dealHeadline("AWAITING_CUSTODY", "SAFEST", viewer, "agent");
      expect(h.label).not.toMatch(/seller to hand/i);
      expect(h.sentence).not.toMatch(/^Invite our agent/);
      expect(h.sentence).not.toMatch(/seller is (handing|inviting)/i);
    }
    expect(
      dealHeadline("AWAITING_CUSTODY", "SAFEST", "agent", "agent").sentence,
    ).toMatch(/Accept/);
  });

  test("while the seller's invite is still owed, the seller is asked for it", () => {
    const h = dealHeadline("AWAITING_CUSTODY", "SAFEST", "seller", "seller");
    expect(h.label).toBe(STATUS_LABELS.AWAITING_CUSTODY);
    expect(h.sentence).toBe(
      statusSentence("AWAITING_CUSTODY", "SAFEST", "seller"),
    );
  });

  test("a safest seller is told the buyer is paying Channel Adda", () => {
    // The price goes to us, never to the seller, and nobody confirms it by
    // hand: we see it arrive.
    const seller = dealHeadline(
      "AWAITING_BUYER_PAYMENT",
      "SAFEST",
      "seller",
      "buyer",
    );
    expect(seller.sentence).toMatch(/to Channel Adda/);
    expect(seller.sentence).not.toMatch(/directly|Confirm/);

    const buyer = dealHeadline(
      "AWAITING_BUYER_PAYMENT",
      "SAFEST",
      "buyer",
      "buyer",
    );
    expect(buyer.label).toMatch(/buyer to pay the price/i);
    expect(buyer.sentence).toMatch(/^Pay the price to Channel Adda/);
  });

  test("on Fastest, the seller's invite comes before the agent's check", () => {
    const seller = dealHeadline(
      "AGENT_VERIFYING",
      "FASTEST",
      "seller",
      "seller",
    );
    expect(seller.label).toMatch(/invite/i);
    expect(seller.sentence).toMatch(/manager/i);
    // Once invited, it is the agent checking, as before.
    expect(
      dealHeadline("AGENT_VERIFYING", "FASTEST", "buyer", "agent").label,
    ).toBe(STATUS_LABELS.AGENT_VERIFYING);
  });

  test("on Fastest, after the seller promotes the buyer, the buyer is asked to confirm", () => {
    const buyer = dealHeadline(
      "AWAITING_HANDOVER",
      "FASTEST",
      "buyer",
      "buyer",
    );
    expect(buyer.label).toMatch(/buyer to confirm/i);
    const seller = dealHeadline(
      "AWAITING_HANDOVER",
      "FASTEST",
      "seller",
      "buyer",
    );
    expect(seller.sentence).not.toMatch(/^Make the buyer/);
  });

  test("a short label exists for every headline, for list rows", () => {
    const h = dealHeadline("AWAITING_CUSTODY", "SAFEST", "buyer", "agent");
    expect(h.short.length).toBeLessThanOrEqual(
      STATUS_SHORT.AWAITING_CUSTODY.length + 6,
    );
    expect(dealHeadline("COMPLETED", "SAFEST", "buyer", null)).toEqual({
      label: STATUS_LABELS.COMPLETED,
      short: STATUS_SHORT.COMPLETED,
      sentence: statusSentence("COMPLETED", "SAFEST", "buyer"),
    });
  });
});
