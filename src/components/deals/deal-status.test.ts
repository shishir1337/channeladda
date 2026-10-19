import { describe, expect, test } from "vitest";
import {
  confirmLabel,
  dealHeadline,
  moneyNote,
  STATUS_LABELS,
  STATUS_SHORT,
  statusSentence,
  stepHelp,
} from "@/components/deals/deal-status";
import { templateFor } from "@/lib/deal-templates";

test("on a safest deal the money note says the buyer pays the seller directly", () => {
  // Channel Adda takes the admin fee and nothing else; the price goes from
  // the buyer to the seller once our agent holds the channel.
  for (const viewer of ["buyer", "seller", "agent"] as const) {
    const note = moneyNote("SAFEST", viewer);
    expect(note).toMatch(/directly/);
    expect(note).toMatch(/fee/);
    expect(note).not.toMatch(/wallet/);
  }
});

test("on a fastest deal the money note says Channel Adda holds it until the buyer is primary owner", () => {
  for (const viewer of ["buyer", "seller", "agent"] as const) {
    const note = moneyNote("FASTEST", viewer);
    expect(note).toMatch(/Channel Adda/);
    expect(note).toMatch(/primary owner/);
    expect(note).not.toMatch(/directly/);
  }
});

test("a finished safest sale tells the seller the buyer paid them", () => {
  const seller = statusSentence("COMPLETED", "SAFEST", "seller");
  expect(seller).toMatch(/paid you directly/);
  expect(seller).not.toMatch(/wallet/);
});

test("every step of both deals says what it involves", () => {
  // An unknown label gets no help rather than a wrong one, so a step added
  // to a template without copy would silently explain nothing.
  for (const mode of ["SAFEST", "FASTEST"] as const) {
    for (const step of templateFor(mode)) {
      expect(stepHelp(mode, step.label), `${mode} ${step.label}`).toBeTruthy();
    }
  }
});

test("one label, two meanings: the help follows the mode", () => {
  // Both deals have a "Confirm manager access", by different people for
  // different reasons.
  expect(stepHelp("SAFEST", "Confirm manager access")).toMatch(/Google/);
  expect(stepHelp("FASTEST", "Confirm manager access")).toMatch(
    /holding period/,
  );
});

test("paying the seller asks for the proof to go in the chat", () => {
  expect(stepHelp("SAFEST", "Pay the seller")).toMatch(/directly/);
  expect(stepHelp("SAFEST", "Pay the seller")).toMatch(/chat/);
});

test("the two Safest payment buttons read exactly as the client asked", () => {
  expect(confirmLabel("Pay the seller")).toBe("Paid");
  expect(confirmLabel("Confirm the payment arrived")).toBe("Received");
});

test("every step a person presses has a button that says what they are confirming", () => {
  for (const mode of ["SAFEST", "FASTEST"] as const) {
    for (const step of templateFor(mode).slice(1)) {
      expect(confirmLabel(step.label), `${mode} ${step.label}`).not.toBe(
        "Mark this done",
      );
    }
  }
});

/**
 * Found walking a whole Safest deal in the browser: once the seller had
 * invited the agent, the seller's own page still told them to invite the
 * agent — the status spans several steps, and the headline only knew the
 * status. On the new Safest one status spans two seller steps and two of
 * the agent's, so the headline follows the open step itself.
 */
describe("the headline follows the open step, not just the status", () => {
  test("once the seller has added the agent, nobody is told the seller still has to", () => {
    for (const viewer of ["buyer", "seller", "agent"] as const) {
      const h = dealHeadline("AWAITING_CUSTODY", "SAFEST", viewer, 3);
      expect(h.label).not.toMatch(/seller to hand/i);
      expect(h.sentence).not.toMatch(/^Add our agent/);
    }
    expect(
      dealHeadline("AWAITING_CUSTODY", "SAFEST", "agent", 3).sentence,
    ).toMatch(/^The seller has added you/);
  });

  test("while the seller's step 2 is owed, the seller is asked to add the agent", () => {
    const h = dealHeadline("AWAITING_CUSTODY", "SAFEST", "seller", 2);
    expect(h.label).toBe(STATUS_LABELS.AWAITING_CUSTODY);
    expect(h.sentence).toMatch(/manager/);
  });

  test("the seller's two Safest custody steps read differently", () => {
    const add = dealHeadline("AWAITING_CUSTODY", "SAFEST", "seller", 2);
    const primary = dealHeadline("AWAITING_CUSTODY", "SAFEST", "seller", 4);
    expect(primary.sentence).toMatch(/primary owner/);
    expect(primary.sentence).not.toBe(add.sentence);
  });

  test("a safest buyer is told to pay the seller directly, and press Paid", () => {
    const buyer = dealHeadline("IN_CUSTODY", "SAFEST", "buyer", 6);
    expect(buyer.label).toMatch(/buyer to pay the seller/i);
    expect(buyer.sentence).toMatch(/directly/);
    expect(buyer.sentence).toMatch(/Paid/);
  });

  test("a safest seller is asked to press Received once the money is in", () => {
    const seller = dealHeadline("IN_CUSTODY", "SAFEST", "seller", 7);
    expect(seller.sentence).toMatch(/Received/);
    const buyer = dealHeadline("IN_CUSTODY", "SAFEST", "buyer", 7);
    expect(buyer.sentence).not.toMatch(/^Pay/);
  });

  test("on Fastest the seller adds the buyer, and the buyer confirms", () => {
    const seller = dealHeadline("AGENT_VERIFYING", "FASTEST", "seller", 2);
    expect(seller.label).toMatch(/add the buyer/i);
    expect(seller.sentence).toMatch(/manager/);
    const buyer = dealHeadline("AGENT_VERIFYING", "FASTEST", "buyer", 3);
    expect(buyer.sentence).toMatch(/holding period/);
  });

  test("on Fastest the seller is told to remove their email when making the buyer primary owner", () => {
    const seller = dealHeadline("AWAITING_HANDOVER", "FASTEST", "seller", 4);
    expect(seller.sentence).toMatch(/primary owner/);
    expect(seller.sentence).toMatch(/remove your email/);
  });

  test("on Fastest, after the seller hands over, the buyer is asked to confirm", () => {
    const buyer = dealHeadline("AWAITING_HANDOVER", "FASTEST", "buyer", 5);
    expect(buyer.label).toMatch(/buyer to confirm/i);
    const seller = dealHeadline("AWAITING_HANDOVER", "FASTEST", "seller", 5);
    expect(seller.sentence).not.toMatch(/^When the holding period/);
  });

  test("every headline has a short label that fits a list row", () => {
    for (const mode of ["SAFEST", "FASTEST"] as const) {
      for (const step of templateFor(mode)) {
        for (const viewer of ["buyer", "seller", "agent"] as const) {
          for (const status of Object.keys(STATUS_LABELS)) {
            const h = dealHeadline(
              status as keyof typeof STATUS_LABELS,
              mode,
              viewer,
              step.position,
            );
            expect(h.short.length, h.short).toBeLessThanOrEqual(22);
          }
        }
      }
    }
    expect(dealHeadline("COMPLETED", "SAFEST", "buyer", null)).toEqual({
      label: STATUS_LABELS.COMPLETED,
      short: STATUS_SHORT.COMPLETED,
      sentence: statusSentence("COMPLETED", "SAFEST", "buyer"),
    });
  });
});
