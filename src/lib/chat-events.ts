import type { DealMode } from "@/generated/prisma/enums";
import { siteDate } from "@/lib/site-time";

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
      type:
        | "offer-expired"
        | "offer-auto-declined"
        | "offer-listing-removed"
        | "reservation-lapsed";
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
  // `did` is the step in its platform's words, after the name: "invited
  // our agent as owner", "sent our agent the login". Lines written before
  // it existed carry only the stored label.
  | { type: "step-done"; name: string; label: string; did?: string }
  | { type: "hold-started"; until: Date }
  | { type: "hold-ended" }
  // Fastest: our agent is primary owner, so the seller has been paid. No
  // amount: the buyer reads this line too, and the seller's fee is theirs.
  | { type: "seller-paid"; asset?: string }
  // Safest: the seller said where to be paid. Never the details themselves:
  // this line is shown in previews.
  | { type: "pay-to-saved"; name: string; changed: boolean }
  // What it is about, in the raiser's words with contact details taken
  // out: the other side used to learn only that one had been raised.
  | { type: "dispute-raised"; name: string; reason?: string }
  | { type: "deal-ended"; outcome: string }
  // After a completed deal: the buyer's stars for the seller. The words of
  // the review stay on the seller's page, not in previews.
  | { type: "seller-reviewed"; name: string; seller: string; rating: number };

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
    case "offer-listing-removed":
      return `The offer of ${money(event.amountCents)} closed: the seller took the listing off the marketplace`;
    case "reservation-lapsed":
      return `The agreed price of ${money(event.amountCents)} lapsed because the deal was never opened. The listing is back on sale`;
    case "deal-opened":
      // A non-breaking hyphen: on a phone "CA-" and "11235" landed on two
      // lines.
      return `${who(event.name)} opened a ${event.mode === "SAFEST" ? "Safest" : "Fastest"} deal at ${money(event.priceCents)} · ${event.reference.replace("-", "‑")}`;
    case "payment-received":
      return `Payment received for ${event.reference}. The deal is under way`;
    case "payment-lapsed":
      return `${event.reference} closed: the payment window ran out before it was paid`;
    case "agent-joined":
      return `${who(event.agentName)} from Channel Adda joined to run this deal`;
    case "agent-changed":
      return `${who(event.agentName)} from Channel Adda now runs this deal. The account to invite or hand it to has changed: use the one shown on this deal, not an earlier one`;
    case "step-done":
      return event.did
        ? `${who(event.name)} ${event.did}`
        : `Done: ${event.label} (${who(event.name)})`;
    case "hold-started":
      // In the site's time zone: written on a UTC server, a wait ending
      // early on an Indian morning read as the day before.
      return `Waiting period until ${siteDate(event.until)}. The next step opens then`;
    case "hold-ended":
      return "The waiting period is over. The next step is open";
    case "pay-to-saved":
      return event.changed
        ? `${who(event.name)} changed where to be paid`
        : `${who(event.name)} added where to be paid`;
    case "seller-paid":
      return event.asset
        ? `Our agent has the ${event.asset} now, so the seller has been paid. Our agent hands it to the buyer next`
        : "Our agent is primary owner, so the seller has been paid. Our agent makes the buyer primary owner next";
    case "dispute-raised":
      return event.reason
        ? `${who(event.name)} raised a dispute: “${event.reason}”. The deal is paused while Channel Adda looks at it`
        : `${who(event.name)} raised a dispute. The deal is paused while Channel Adda looks at it`;
    case "deal-ended":
      return event.outcome;
    case "seller-reviewed":
      return `${who(event.name)} gave ${who(event.seller)} ${event.rating} ${event.rating === 1 ? "star" : "stars"}`;
  }
}

/**
 * A stored line, read from the reader's side.
 *
 * A line is written once, with the name of whoever did it, and both sides
 * read it — so on Bilal's own screen it said "Bilal Ahmed opened a Safest
 * deal" (QA, 2026-10-26). The person who did it reads "You": the name that
 * starts the line is theirs, or the one in brackets on a line written
 * before lines led with it. Nothing else in the line changes.
 */
export function eventForReader(
  body: string,
  reader: { mine: boolean; senderName: string },
): string {
  const name = reader.senderName.trim();
  if (!reader.mine || !name) return body;
  if (body.startsWith(`${name} `)) return `You ${body.slice(name.length + 1)}`;
  const older = ` (${name})`;
  if (body.startsWith("Done: ") && body.endsWith(older)) {
    return `${body.slice(0, -older.length)} (you)`;
  }
  return body;
}
