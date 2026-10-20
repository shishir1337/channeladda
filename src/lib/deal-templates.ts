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
   * The irreversible act of giving the channel to the buyer: our agent's,
   * in both modes. Without this a refund could not tell “the channel has
   * gone to the buyer” from “nothing has happened yet” — and a buyer who
   * held the channel and never pressed confirm could be refunded in full
   * with one click.
   */
  handsOver?: boolean;
  /**
   * The seller's step that brings our agent in. It cannot be done while no
   * agent is on the deal: the seller would be inviting nobody, and pressing
   * it anyway recorded an invitation that never happened.
   */
  needsAgent?: boolean;
  /**
   * Fastest only: the step after which the seller is paid, before the deal
   * ends. Our agent is primary owner by then, so the channel is out of the
   * seller's hands; the buyer's money settles to the seller there, and the
   * last step only hands the channel on.
   */
  paysSeller?: boolean;
  /**
   * The first step that acts on the buyer's handover account. Until it is
   * done the buyer may still correct the account; after it, a change would
   * only point at somewhere the channel is not.
   */
  usesHandover?: boolean;
  /**
   * Completing this step starts the deal's one hold — Google's wait before
   * our agent can be made primary owner on Safest, the holding period on
   * Fastest, which is our agent's own wait to become primary owner too.
   * While it runs no step can be done, and when it ends the next person is
   * told (`announceEndedHolds`).
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
 * The owner's process of 2026-10-20. Our agent takes the channel first: the
 * seller invites them as owner, Google's 7-day wait runs, and the seller
 * makes them primary owner — YouTube lets only a primary owner transfer a
 * channel, which our agent must do at the end. Our agent then verifies it
 * (ownership, monetization, strikes, that it is genuine) and posts the
 * latest proof for the buyer. Only then does the buyer pay the seller,
 * directly, and once the seller says the money arrived our agent transfers
 * ownership to the buyer, which ends the deal.
 *
 * That ordering is the whole protection: the buyer pays nobody until the
 * channel is verifiably out of the seller's hands, and the seller loses it
 * to the buyer only once they have said the money arrived. Channel Adda
 * takes the admin fee and nothing else; a seller who is paid and will not
 * say so is a dispute, decided by staff with the channel still in our hands.
 */
const SAFEST_STEPS: readonly StepTemplate[] = Object.freeze([
  { position: 1, label: "Pay the admin fee", actor: "buyer" },
  {
    position: 2,
    label: "Invite the agent as owner",
    actor: "seller",
    needsAgent: true,
  },
  {
    position: 3,
    label: "Accept the owner invite",
    actor: "agent",
    startsHold: true,
  },
  { position: 4, label: "Make the agent primary owner", actor: "seller" },
  {
    position: 5,
    label: "Verify the channel",
    actor: "agent",
    // Only now does the agent genuinely own it: until the seller makes them
    // primary owner the seller could still take the access back.
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
    label: "Transfer ownership to the buyer",
    actor: "agent",
    entersStatus: "COMPLETED",
    needsApprovalAbove: true,
    handsOver: true,
    usesHandover: true,
  },
]);

/**
 * Fastest: the money is escrowed, and our agent takes the channel on.
 *
 * The owner's process of 2026-10-20. The buyer pays the whole amount to
 * Channel Adda. The seller invites our agent as owner; our agent invites the
 * buyer, and the holding period starts — which is also Google's wait before
 * our agent can be made primary owner. Then the seller makes our agent
 * primary owner, and the seller is paid: the channel is in our hands, not
 * theirs. Our agent then makes the buyer primary owner, which ends the deal.
 *
 * The buyer presses nothing after paying. Until the seller is paid the
 * platform holds the money, so the protection is that it can refund; after,
 * our agent holds the channel, so it is that they hand it on.
 */
const FASTEST_STEPS: readonly StepTemplate[] = Object.freeze([
  { position: 1, label: "Pay the full amount", actor: "buyer" },
  {
    position: 2,
    label: "Invite the agent as owner",
    actor: "seller",
    needsAgent: true,
  },
  {
    position: 3,
    label: "Invite the buyer as owner",
    actor: "agent",
    usesHandover: true,
    entersStatus: "AWAITING_HANDOVER",
    startsHold: true,
  },
  { position: 4, label: "Make the agent primary owner", actor: "seller" },
  {
    position: 5,
    label: "Confirm primary ownership",
    actor: "agent",
    entersStatus: "IN_CUSTODY",
    paysSeller: true,
    needsApprovalAbove: true,
  },
  {
    position: 6,
    label: "Make the buyer primary owner",
    actor: "agent",
    entersStatus: "COMPLETED",
    needsApprovalAbove: true,
    handsOver: true,
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
