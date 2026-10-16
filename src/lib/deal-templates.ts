import type { DealMode, OrderStatus } from "@/generated/prisma/enums";
import type { DealActor } from "@/lib/deal-machine";

/**
 * What actually has to happen, in order, for each kind of deal.
 *
 * The status on an order is deliberately coarse — it answers "whose move is
 * it?" and little else. These templates carry the choreography: the real-world
 * actions, who performs each one, and which of them move the status along.
 * Seeded as `TransferStep` rows when a deal's opening payment clears.
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
 * Two ownership transfers, each waiting on Google's own clock, with the
 * buyer's payment to the seller sitting between them. That ordering is the
 * whole protection — the buyer does not pay until the channel is verifiably
 * out of the seller's hands, and the seller does not lose it to the buyer
 * until the money has arrived.
 */
const SAFEST_STEPS: readonly StepTemplate[] = Object.freeze([
  { position: 1, label: "Pay the admin fee", actor: "buyer" },
  { position: 2, label: "Invite the agent as channel owner", actor: "seller" },
  { position: 3, label: "Accept and confirm custody", actor: "agent" },
  {
    position: 4,
    label: "Hold 1 complete, ownership verified",
    actor: "agent",
    // Only now does the agent genuinely own it: step 3 is accepting the
    // invite, this is Google's transfer actually completing.
    entersStatus: "IN_CUSTODY",
  },
  {
    position: 5,
    label: "Inspect the channel",
    actor: "buyer",
    entersStatus: "AWAITING_BUYER_PAYMENT",
  },
  { position: 6, label: "Pay the seller directly", actor: "buyer" },
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
    needsApprovalAbove: true,
  },
  {
    position: 9,
    label: "Hold 2 complete, ownership verified",
    actor: "agent",
    entersStatus: "COMPLETED",
  },
]);

/**
 * Fastest: the money is escrowed, not the channel.
 *
 * One ownership transfer, straight from seller to buyer, with the agent
 * supervising as a manager rather than taking ownership. The platform holds
 * the whole amount throughout, so the protection is that it can refund.
 */
const FASTEST_STEPS: readonly StepTemplate[] = Object.freeze([
  { position: 1, label: "Pay the full amount", actor: "buyer" },
  { position: 2, label: "Invite the agent as manager", actor: "seller" },
  {
    position: 3,
    label: "Verify the channel matches the listing",
    actor: "agent",
    entersStatus: "AWAITING_HANDOVER",
  },
  { position: 4, label: "Promote the buyer to primary owner", actor: "seller" },
  {
    position: 5,
    label: "Confirm access received",
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
