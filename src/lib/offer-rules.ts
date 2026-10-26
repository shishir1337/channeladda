/**
 * What an offer may be, in one place for the server and the forms.
 *
 * The server decides; the forms use the same rules only to say why before
 * the button is pressed. QA found a $9,000 offer accepted on a $900 listing
 * (read back as "1000% of asking"), and a seller countering $650 to a buyer
 * who had offered $700 — both were simply never checked.
 */

/** Below this an offer is not a negotiation, it is noise. */
export const MIN_OFFER_FRACTION = 0.5;

export type AmountProblem =
  /** Under half the asking price. */
  | "too-low"
  /** A buyer's offer at or above the asking price: they can just buy. */
  | "at-asking"
  /** A seller's counter at or below what the buyer offered. */
  | "counter-not-higher"
  /** A seller's counter above their own asking price. */
  | "above-asking"
  /** A buyer's counter at or above the seller's price: they can accept it. */
  | "counter-not-lower";

export const OFFER_PROBLEM_TEXT: Record<AmountProblem, string> = {
  "too-low": "That is less than half the asking price. Try a serious number.",
  "at-asking":
    "That is the asking price or more. Start a deal at the asking price instead — an offer is for less.",
  "counter-not-higher":
    "A counter has to be more than the buyer offered. To take their offer, accept it.",
  "above-asking": "A counter can't be more than your asking price.",
  "counter-not-lower":
    "A counter has to be less than the seller's price. To pay that price, accept it.",
};

/**
 * Why this amount cannot be sent, or null when it can.
 *
 * `answering` is the offer being countered. A seller's counter sits between
 * the buyer's number and the asking price (the asking price itself is a fair
 * answer: "no discount"). A buyer's counter is below the seller's number.
 * The seller's own opening price is checked by `proposePrice`, which wants
 * it below the asking price.
 *
 * `askingCents` may be null where a form does not know it (a card in the
 * chat): only the rules against the offer being answered are checked then,
 * and the server checks the rest.
 */
export function amountProblem(input: {
  amountCents: number;
  askingCents: number | null;
  answering?: { amountCents: number; bySeller: boolean };
}): AmountProblem | null {
  const { amountCents, askingCents, answering } = input;
  const known = askingCents !== null;
  if (known && amountCents < askingCents * MIN_OFFER_FRACTION) {
    return "too-low";
  }

  if (!answering)
    return known && amountCents >= askingCents ? "at-asking" : null;

  if (answering.bySeller) {
    // The buyer answering the seller's number.
    if (amountCents >= answering.amountCents) return "counter-not-lower";
    if (known && amountCents >= askingCents) return "at-asking";
    return null;
  }
  // The seller answering the buyer's number.
  if (amountCents <= answering.amountCents) return "counter-not-higher";
  if (known && amountCents > askingCents) return "above-asking";
  return null;
}

/**
 * An amount as people type it: "2,100", "$150", " 1 250.00 ". One reader
 * for every number field on the site, in `@/lib/typed-number`.
 */
export { parseAmount } from "@/lib/typed-number";
