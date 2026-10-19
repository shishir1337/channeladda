import { expect, test } from "vitest";
import { type ChatEvent, eventText } from "@/lib/chat-events";

// One of each, so a variant added later without words fails here.
const EXAMPLES: ChatEvent[] = [
  { type: "offer-made", name: "Rafi", amountCents: 200_000, bySeller: false },
  { type: "offer-made", name: "Nadia", amountCents: 220_000, bySeller: true },
  { type: "countered", name: "Nadia", amountCents: 220_000 },
  { type: "offer-accepted", name: "Rafi", amountCents: 220_000 },
  { type: "offer-declined", name: "Nadia", amountCents: 150_000 },
  { type: "offer-withdrawn", name: "Rafi", amountCents: 200_000 },
  { type: "offer-expired", amountCents: 200_000 },
  { type: "offer-auto-declined", amountCents: 200_000 },
  { type: "reservation-lapsed", amountCents: 220_000 },
  {
    type: "deal-opened",
    name: "Rafi",
    mode: "SAFEST",
    reference: "CA-40218",
    priceCents: 220_000,
  },
  { type: "payment-received", reference: "CA-40218" },
  { type: "payment-lapsed", reference: "CA-40218" },
  { type: "agent-joined", agentName: "Sami" },
  { type: "agent-changed", agentName: "Tanvir" },
  { type: "step-done", name: "Nadia", label: "Invite the agent as owner" },
  { type: "hold-started", until: new Date("2026-11-02T12:00:00Z") },
  { type: "hold-ended" },
  { type: "dispute-raised", name: "Rafi" },
  { type: "deal-ended", outcome: "Buyer refunded" },
];

test.each(EXAMPLES)("every event renders a sentence: $type", (event) => {
  const text = eventText(event);
  expect(text.trim().length).toBeGreaterThan(0);
  // A sentence, not a template with a hole in it.
  expect(text).not.toMatch(/undefined|null|NaN/);
});

test("money reads as dollars", () => {
  expect(
    eventText({
      type: "offer-made",
      name: "Rafi",
      amountCents: 200_000,
      bySeller: false,
    }),
  ).toContain("$2,000");
  // Cents are shown only when there are some.
  expect(eventText({ type: "offer-expired", amountCents: 9_950 })).toContain(
    "$99.50",
  );
});

test("agent-changed says the invite address changed", () => {
  // A seller who already invited the previous agent's address has to be told
  // plainly, or they hand their channel to nobody.
  const text = eventText({ type: "agent-changed", agentName: "Tanvir" });
  expect(text).toMatch(/invite/i);
  expect(text).toMatch(/changed/i);
});

test("a missing name still reads as a sentence", () => {
  expect(
    eventText({ type: "offer-accepted", name: "  ", amountCents: 100 }),
  ).toMatch(/^Someone /);
});
