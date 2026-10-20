import type { DealMode } from "@/generated/prisma/enums";

/**
 * What a conversation says happened.
 *
 * Every offer and every step of a deal leaves a line in the conversation it
 * belongs to, so the thread reads as the record of the deal whichever page
 * somebody acted from. This module is the words, and only the words: pure, so
 * every line can be tested without a database.
 *
 * The text ends up in more places than the thread — the conversation list
 * preview, the bell, an email subject. So no variant carries anything that
 * only one side may see: no payment details, no agent's email address. That
 * rule is enforced by the type rather than by remembering it — there is no
 * field to put them in.
 */
export type ChatEvent =
  | { type: "offer-made"; name: string; amountCents: number; bySeller: boolean }
  | { type: "countered"; name: string; amountCents: number }
  | {
      type: "offer-accepted" | "offer-declined" | "offer-withdrawn";
      name: string;
      amountCents: number;
    }
  | {
      type: "offer-expired" | "offer-auto-declined" | "reservation-lapsed";
      amountCents: number;
    }
  | {
      type: "deal-opened";
      name: string;
      mode: DealMode;
      reference: string;
      priceCents: number;
    }
  | { type: "payment-received" | "payment-lapsed"; reference: string }
  | { type: "agent-joined" | "agent-changed"; agentName: string }
  | { type: "step-done"; name: string; label: string }
  | { type: "hold-started"; until: Date }
  | { type: "hold-ended" }
  // Fastest: our agent is primary owner, so the seller has been paid. No
  // amount: the buyer reads this line too, and the seller's fee is theirs.
  | { type: "seller-paid" }
  // Safest: the seller said where to be paid. Never the details themselves:
  // this line is shown in previews.
  | { type: "pay-to-saved"; name: string; changed: boolean }
  | { type: "dispute-raised"; name: string }
  | { type: "deal-ended"; outcome: string };

/** $2,000.00, $99.50: always two decimals, as every amount on the site. */
export function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** A blank name reads as a hole in the sentence. */
function who(name: string): string {
  return name.trim() || "Someone";
}

export function eventText(event: ChatEvent): string {
  switch (event.type) {
    case "offer-made":
      return event.bySeller
        ? `${who(event.name)} offered to sell for ${money(event.amountCents)}`
        : `${who(event.name)} offered ${money(event.amountCents)}`;
    case "countered":
      return `${who(event.name)} countered with ${money(event.amountCents)}`;
    case "offer-accepted":
      return `${who(event.name)} accepted ${money(event.amountCents)}`;
    case "offer-declined":
      return `${who(event.name)} turned down ${money(event.amountCents)}`;
    case "offer-withdrawn":
      return `${who(event.name)} withdrew the offer of ${money(event.amountCents)}`;
    case "offer-expired":
      return `The offer of ${money(event.amountCents)} lapsed without an answer`;
    case "offer-auto-declined":
      return `The offer of ${money(event.amountCents)} closed: the listing went to another buyer`;
    case "reservation-lapsed":
      return `The agreed price of ${money(event.amountCents)} lapsed because the deal was never opened. The listing is back on sale`;
    case "deal-opened":
      return `${who(event.name)} opened a ${event.mode === "SAFEST" ? "Safest" : "Fastest"} deal at ${money(event.priceCents)} (${event.reference})`;
    case "payment-received":
      return `Payment received for ${event.reference}. The deal is under way`;
    case "payment-lapsed":
      return `${event.reference} closed: the payment window ran out before it was paid`;
    case "agent-joined":
      return `${who(event.agentName)} from Channel Adda joined to run this deal`;
    case "agent-changed":
      return `${who(event.agentName)} from Channel Adda now runs this deal. The account to invite has changed: use the one shown on this deal, not an earlier one`;
    case "step-done":
      return `Done: ${event.label} (${who(event.name)})`;
    case "hold-started":
      return `Waiting period until ${event.until.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })}. The next step opens then`;
    case "hold-ended":
      return "The waiting period is over. The next step is open";
    case "pay-to-saved":
      return event.changed
        ? `${who(event.name)} changed where to be paid`
        : `${who(event.name)} added where to be paid`;
    case "seller-paid":
      return "Our agent is primary owner, so the seller has been paid. Our agent makes the buyer primary owner next";
    case "dispute-raised":
      return `${who(event.name)} raised a dispute. The deal is paused while Channel Adda looks at it`;
    case "deal-ended":
      return event.outcome;
  }
}
