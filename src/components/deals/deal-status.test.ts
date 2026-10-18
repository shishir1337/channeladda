import { describe, expect, test } from "vitest";
import {
  dealHeadline,
  STATUS_LABELS,
  STATUS_SHORT,
  statusSentence,
} from "@/components/deals/deal-status";

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

  test("after the buyer records paying, the seller is asked to confirm", () => {
    const seller = dealHeadline(
      "AWAITING_BUYER_PAYMENT",
      "SAFEST",
      "seller",
      "seller",
    );
    expect(seller.label).toMatch(/seller to confirm/i);
    expect(seller.sentence).toMatch(/Confirm/);

    const buyer = dealHeadline(
      "AWAITING_BUYER_PAYMENT",
      "SAFEST",
      "buyer",
      "seller",
    );
    expect(buyer.label).not.toMatch(/buyer to pay/i);
    expect(buyer.sentence).not.toMatch(/^Send the channel's price/);
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
