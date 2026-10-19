import type { DealMode } from "@/generated/prisma/enums";

/**
 * The ways staff can end a deal, as the desk describes them.
 *
 * Pure and apart from the control that draws them, so what each one says it
 * does with the channel and the money is pinned by a test: on Safest the
 * desk once promised to pay out and refund a price Channel Adda never holds.
 */
export type EndingTo =
  | "DISPUTED"
  | "RETURNED_TO_SELLER"
  | "REFUNDED"
  | "CANCELLED"
  | "COMPLETED";

export type Ending = {
  to: EndingTo;
  label: string;
  /** Plain words for what happens to the channel and to the money. */
  consequence: (mode?: DealMode) => string;
  /** How it is worth treating: a pause, something final, or a payout. */
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
    consequence: (mode) =>
      mode === "FASTEST"
        ? "Safest only. On a Fastest deal the agent never owns the channel, so there is nothing to hand back."
        : "The agent gives ownership back to the seller and the buyer ends up with no channel. The admin fee goes back to the buyer unless our agent has taken custody, when it is kept for the work. We never held the price: what the buyer paid the seller directly is between them. Refused once the seller has pressed Received.",
  },
  {
    to: "REFUNDED",
    label: "Refund the buyer",
    weight: "money",
    applies: (mode) => mode !== "SAFEST",
    consequence: (mode) =>
      mode === "SAFEST"
        ? "Fastest only. On a Safest deal we hold only the admin fee; return the channel to the seller instead."
        : "Returns the price and the fee we are holding to the buyer. The seller is paid nothing.",
  },
  {
    to: "CANCELLED",
    label: "Cancel the deal",
    weight: "final",
    consequence: (mode) =>
      mode === "FASTEST"
        ? "Ends it and frees the listing. If the buyer has paid, everything we are holding — price and fee — goes back to their balance."
        : mode === "SAFEST"
          ? "Ends it and frees the listing. Before our agent holds the channel, the admin fee goes back to the buyer. Once the agent holds it, this is refused — return the channel instead."
          : "Ends it and frees the listing, returning whatever we are holding for the buyer.",
  },
  {
    to: "COMPLETED",
    label: "Finish the deal",
    weight: "money",
    consequence: (mode) =>
      mode === "FASTEST"
        ? "Marks the deal complete and credits the seller's wallet with the money we are holding. This pays out, so it is refused until the seller has made the buyer primary owner."
        : mode === "SAFEST"
          ? "Marks the deal complete: our agent hands the channel to the buyer, and the admin fee becomes ours. We never held the price, so nobody is paid it from here. Refused until the buyer has pressed Paid."
          : "Marks the deal complete. On a Fastest deal this also credits the seller's wallet with the money we are holding.",
  },
];
