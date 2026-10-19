import type { DealMode, OrderStatus } from "@/generated/prisma/enums";
import type { DealActor } from "@/lib/deal-machine";

/**
 * What actually has to happen, in order, for each kind of deal.
 *
 * The status on an order is deliberately coarse — it answers "whose move is
 * it?" and little else. These templates carry the choreography: the real-world
 * actions, who performs each one, and which of them move the status along.
 * Seeded as `TransferStep` rows when a deal is created.
 *
 * Keeping them here, in data, rather than as branches in the server layer is
 * what makes a third mode a new array instead of a migration.
 *
 * Labels are the ones shown to buyers and sellers. They say what the person
 * must do, not what the system records.
 */
export type StepTemplate = {
  /** 1-based, and contiguous. The lowest incomplete position is the next move. */
  position: number;
  label: string;
  actor: DealActor;
  /**
   * Set when completing this step moves the order's coarse status. Absent
   * means the step is progress within the current status — a real action with
   * nothing for the state machine to do.
   */
  entersStatus?: OrderStatus;
  /**
   * Set on the step that hands value to the other side. Above the platform's
   * threshold these need a second staff member, so one compromised agent
   * cannot misdirect a channel or a payout.
   */
  needsApprovalAbove?: boolean;
  /**
   * The irreversible act of giving the channel to the buyer: our agent on
   * Safest, the seller on Fastest. It stamps nothing on the order, so
   * without this a refund could not tell “the channel has gone to the
   * buyer” from “nothing has happened yet” — and a buyer who held the
   * channel and never pressed confirm could be refunded in full with one
   * click.
   */
  handsOver?: boolean;
  /**
   * The first step that acts on the buyer's handover account. Until it is
   * done the buyer may still correct the account; after it, a change would
   * only point at somewhere the channel is not.
   */
  usesHandover?: boolean;
  /**
   * Completing this step starts the deal's one hold — Google's wait before
   * our agent can be made primary owner on Safest, the holding period
   * before the buyer is on Fastest. While it runs no step can be done, and
   * when it ends the next person is told (`announceEndedHolds`).
   */
  startsHold?: boolean;
};

/**
 * Where each mode lands once the buyer's opening payment clears.
 *
 * Step 1 is the payment itself and carries no `entersStatus`: recording the
 * payment performs that transition as the system, and a template that also
 * claimed it would try to do it twice.
 */
export const OPENING_STATUS: Readonly<Record<DealMode, OrderStatus>> =
  Object.freeze({
    SAFEST: "AWAITING_CUSTODY",
    FASTEST: "AGENT_VERIFYING",
  });

/**
 * Safest: the channel is escrowed, not the money.
 *
 * Our agent takes the channel first — manager, Google's wait, then primary
 * owner — and only then does the buyer pay the seller, directly, the way
 * they agreed in the chat. That ordering is the whole protection: the buyer
 * pays nobody until the channel is verifiably out of the seller's hands,
 * and the seller loses it to the buyer only once they have said the money
 * arrived. Channel Adda takes the admin fee and nothing else; a seller who
 * is paid and will not say so is a dispute, decided by staff with the
 * channel still in our hands.
 */
const SAFEST_STEPS: readonly StepTemplate[] = Object.freeze([
  { position: 1, label: "Pay the admin fee", actor: "buyer" },
  { position: 2, label: "Add the agent as manager", actor: "seller" },
  {
    position: 3,
    label: "Confirm manager access",
    actor: "agent",
    startsHold: true,
  },
  { position: 4, label: "Make the agent primary owner", actor: "seller" },
  {
    position: 5,
    label: "Confirm primary ownership",
    actor: "agent",
    // Only now does the agent genuinely own it: step 3 is a manager's
    // access, which the seller could still take back.
    entersStatus: "IN_CUSTODY",
  },
  { position: 6, label: "Pay the seller", actor: "buyer" },
  {
    position: 7,
    label: "Confirm the payment arrived",
    actor: "seller",
    entersStatus: "AWAITING_HANDOVER",
  },
  {
    position: 8,
    label: "Make the buyer the owner",
    actor: "agent",
    needsApprovalAbove: true,
    handsOver: true,
    usesHandover: true,
  },
  {
    position: 9,
    label: "Confirm ownership received",
    actor: "buyer",
    entersStatus: "COMPLETED",
  },
]);

/**
 * Fastest: the money is escrowed, not the channel.
 *
 * One transfer, straight from seller to buyer, with our agent supervising
 * it rather than taking the channel: the buyer is a manager through the
 * holding period, then primary owner with the seller's email gone, and
 * only then is the seller paid. The platform holds the whole amount
 * throughout, so the protection is that it can refund.
 */
const FASTEST_STEPS: readonly StepTemplate[] = Object.freeze([
  { position: 1, label: "Pay the full amount", actor: "buyer" },
  {
    position: 2,
    label: "Add the buyer as manager",
    actor: "seller",
    usesHandover: true,
  },
  {
    position: 3,
    label: "Confirm manager access",
    actor: "buyer",
    entersStatus: "AWAITING_HANDOVER",
    startsHold: true,
  },
  {
    position: 4,
    label: "Make the buyer primary owner",
    actor: "seller",
    handsOver: true,
  },
  {
    position: 5,
    label: "Confirm primary ownership",
    actor: "buyer",
    entersStatus: "AWAITING_RELEASE",
  },
  {
    position: 6,
    label: "Release the seller's funds",
    actor: "agent",
    entersStatus: "COMPLETED",
    needsApprovalAbove: true,
  },
]);

export function templateFor(mode: DealMode): readonly StepTemplate[] {
  return mode === "FASTEST" ? FASTEST_STEPS : SAFEST_STEPS;
}

/**
 * Whether a deal's seeded steps are this template's, label for label.
 *
 * Steps are written when a deal opens, so a deal opened under an earlier
 * template keeps its old steps while the step machine reads the new ones by
 * position — the two disagree about who does what. `pnpm deals:in-flight`
 * uses this to find any such deal before a deploy changes a template.
 */
export function usesCurrentSteps(
  mode: DealMode,
  labels: readonly string[],
): boolean {
  const current = templateFor(mode);
  return (
    labels.length === current.length &&
    current.every((step, index) => labels[index] === step.label)
  );
}
