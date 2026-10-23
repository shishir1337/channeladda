import type { DealMode, OrderStatus } from "@/generated/prisma/enums";

/**
 * Whether the buyer or the seller may call a deal off themselves.
 *
 * Before payment there is nothing to undo. After it, only while the seller
 * has pressed nothing: their first step invites our agent onto the channel,
 * and from then on the agent has access that staff have to see handed back,
 * through a dispute. The same rule `resolveDeal` enforces, for the UI to
 * offer the button only where it will work.
 */
const PAID_BUT_UNTOUCHED: Readonly<Record<DealMode, OrderStatus>> = {
  SAFEST: "AWAITING_CUSTODY",
  FASTEST: "AGENT_VERIFYING",
};

export function memberMayCancel(deal: {
  mode: DealMode;
  status: OrderStatus;
  steps: readonly { actor: string; completedAt: Date | null }[];
}): boolean {
  if (deal.status === "AWAITING_PAYMENT") return true;
  if (deal.status !== PAID_BUT_UNTOUCHED[deal.mode]) return false;
  return !deal.steps.some(
    (step) => step.actor === "seller" && step.completedAt !== null,
  );
}
