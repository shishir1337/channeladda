import type { DealMode } from "@/generated/prisma/enums";
import { movesHeldMoney } from "@/lib/outcomes";

/**
 * The ways staff can end a deal, as the desk describes them.
 *
 * Pure and apart from the control that draws them, so what each one says it
 * does with the channel and the money is pinned by a test: on Safest the
 * desk once promised to pay out and refund a price Channel Adda never holds.
 */
/**
 * The longest note a deal's ending or dispute may carry: the raiser's own
 * words and the desk's alike. The same limit as the dispute desk's notes.
 */
export const MAX_DEAL_NOTE = 2_000;

/**
 * How the panel says what cannot be undone, counted from the outcomes it
 * actually shows — a paused deal is not offered the pause again, and "four
 * of these five" sat above four options.
 */
export function undoLine(shown: readonly Pick<Ending, "weight">[]): string {
  const final = shown.filter((ending) => ending.weight !== "pause").length;
  if (final === 0) return "None of these is final.";
  if (final === shown.length) {
    return final === 1
      ? "This cannot be undone."
      : "None of these can be undone.";
  }
  const words = ["no", "one", "two", "three", "four", "five", "six"];
  const say = (n: number) => words[n] ?? String(n);
  const first = say(final);
  return `${first.charAt(0).toUpperCase()}${first.slice(1)} of these ${say(shown.length)} cannot be undone.`;
}

export type EndingTo =
  | "DISPUTED"
  | "RETURNED_TO_SELLER"
  | "REFUNDED"
  | "CANCELLED"
  | "COMPLETED";

/** What the desk knows about the deal it is describing an ending for. */
export type EndingContext = {
  /** The deal's words (`staffWords`): "Page", "our agent gives the buyer
   *  full control", "when our agent took the Page". */
  words?: { asset: string; handToBuyer: string; agentTook: string };
  /**
   * Fastest: our agent took the account, so the seller has been paid and
   * nothing of theirs is held any more (`custodyAt`).
   */
  sellerPaid?: boolean;
};

export type Ending = {
  to: EndingTo;
  label: string;
  /** Plain words for what happens to the channel and to the money. */
  consequence: (mode?: DealMode, ctx?: EndingContext) => string;
  /**
   * How it is worth treating: a pause, something final, or a payout. The
   * desk's tag is worked out from the deal with `endingWeight`, so it says
   * what the consequence says.
   */
  weight: "pause" | "final" | "money";
  /** False when this mode cannot reach it at all — still offered, see below. */
  applies?: (mode?: DealMode) => boolean;
};

/**
 * Pausing comes first because it is the way into the other four on a deal that
 * is still running: finishing one is the last step's job, and `resolveDeal`
 * only decides a deal that is actually in dispute.
 *
 * Which endings are legal from here is decided by the transition table, not by
 * this list, so an illegal one comes back as a refusal rather than being
 * hidden — staff get told why instead of wondering where a button went. What
 * this list does add is the warning before the refusal: an outcome the mode
 * can never reach is marked as such, with the reason, so the refusal is not a
 * surprise.
 */
export const ENDINGS: readonly Ending[] = [
  {
    to: "DISPUTED",
    label: "Pause it for review",
    weight: "pause",
    consequence: () =>
      "Freezes the deal and marks it disputed. Nothing moves until a moderator decides it, and all four outcomes below stay open. Reversible in the sense that it decides nothing.",
  },
  {
    to: "RETURNED_TO_SELLER",
    label: "Return the channel to the seller",
    weight: "final",
    applies: (mode) => mode !== "FASTEST",
    consequence: (mode, ctx) => {
      const asset = wordsOf(ctx).asset;
      return mode === "FASTEST"
        ? `Safest only. A Fastest deal is refunded instead, and our agent leaves the ${asset} with the seller.`
        : `The agent gives the ${asset} back to the seller and the buyer ends up with nothing. The admin fee goes back to the buyer unless our agent has taken custody, when it is kept for the work. We never held the price: what the buyer paid the seller directly is between them. Refused once the seller has pressed Received.`;
    },
  },
  {
    to: "REFUNDED",
    label: "Refund the buyer",
    weight: "money",
    applies: (mode) => mode !== "SAFEST",
    consequence: (mode, ctx) => {
      const asset = wordsOf(ctx).asset;
      return mode === "SAFEST"
        ? `Fastest only. On a Safest deal we hold only the admin fee; return the ${asset} to the seller instead.`
        : `Returns the price and the fee we are holding to the buyer, and our agent removes the buyer and themselves from the ${asset}. The seller is paid nothing. Refused once our agent holds the ${asset}: the seller has been paid by then, so finish the deal instead.`;
    },
  },
  {
    to: "CANCELLED",
    label: "Cancel the deal",
    weight: "final",
    consequence: (mode, ctx) => {
      const asset = wordsOf(ctx).asset;
      return mode === "FASTEST"
        ? `Ends it and frees the listing. If the buyer has paid, everything we are holding — price and fee — goes back to their balance. Refused once our agent holds the ${asset}.`
        : mode === "SAFEST"
          ? `Ends it and frees the listing. Before our agent holds the ${asset}, the admin fee goes back to the buyer. Once the agent holds it, this is refused — return the ${asset} instead.`
          : "Ends it and frees the listing, returning whatever we are holding for the buyer.";
    },
  },
  {
    to: "COMPLETED",
    label: "Finish the deal",
    weight: "money",
    consequence: (mode, ctx) => {
      const say = wordsOf(ctx);
      if (mode === "FASTEST") {
        // Its tag says the same (`endingWeight`): "moves money" sat beside
        // "nothing more is paid out here" (QA, CA-75190).
        return ctx?.sellerPaid
          ? `Marks the deal complete: ${say.handToBuyer}. The seller was paid ${say.agentTook}, so no money moves here — finance still decides it.`
          : `Marks the deal complete: pays the seller the price we are holding, and ${say.handToBuyer}. Refused until the seller has handed the ${say.asset} over.`;
      }
      return mode === "SAFEST"
        ? `Marks the deal complete: ${say.handToBuyer}, and the admin fee becomes ours. We never held the price, so nobody is paid it from here. Refused until the buyer has pressed Paid.`
        : "Marks the deal complete. On a Fastest deal this also credits the seller's wallet with the money we are holding.";
    },
  },
];

/** "Return the Page to the seller": the ending's name in the deal's words. */
export function endingLabel(ending: Ending, ctx?: EndingContext): string {
  if (ending.to !== "RETURNED_TO_SELLER") return ending.label;
  return `Return the ${wordsOf(ctx).asset} to the seller`;
}

/** YouTube's words, for a caller that has not said which platform. */
function wordsOf(ctx?: EndingContext) {
  return (
    ctx?.words ?? {
      asset: "channel",
      handToBuyer: "our agent hands the channel to the buyer",
      agentTook: "when our agent became primary owner",
    }
  );
}

/**
 * How the desk tags an ending on this deal: a pause, final, or final and
 * moving money — what its consequence says. Finishing a Fastest deal whose
 * seller was paid when our agent took the account moves nothing: it was
 * tagged "moves money" beside "nothing more is paid out here" (QA,
 * CA-75190). Who may decide it is a separate rule (`needsFinance`).
 */
export function endingWeight(
  ending: Ending,
  paid: boolean,
  sellerPaid = false,
): Ending["weight"] {
  if (ending.weight === "pause") return "pause";
  if (ending.to === "COMPLETED" && sellerPaid) return "final";
  return movesHeldMoney(ending.to, paid) ? "money" : "final";
}

/**
 * Whether only finance may choose it: the server's gate, word for word.
 * Every outcome of a paid deal stays finance's, even one that releases
 * nothing — the owner's line (`custody-safety.test`).
 */
export function needsFinance(ending: Ending, paid: boolean): boolean {
  return ending.weight === "money" || movesHeldMoney(ending.to, paid);
}
