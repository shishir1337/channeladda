import type { DealMode } from "@/generated/prisma/enums";

/**
 * What the platform should be holding for a deal that is still running.
 *
 * Everything a buyer pays is held, in both modes, and only becomes ours or
 * the seller's when it is earned: at completion, or — for a Safest fee — when
 * a deal fails after our agent has done the work. So this is simply what has
 * been paid in so far. A Safest deal takes the fee up front and the price
 * later; a Fastest deal takes both at once.
 *
 * Completion and every refund check the ledger against this before moving
 * anything, so a deal whose books do not add up stops instead of writing
 * rows that would never net.
 */
export function requiredHold(order: {
  mode: DealMode;
  paymentRef: string | null;
  totalUsd: number;
  buyerFeeUsd: number;
  priceUsd: number;
  buyerPaidAt: Date | null;
}): number {
  if (order.paymentRef === null) return 0;
  if (order.mode === "FASTEST") return order.totalUsd;
  return order.buyerFeeUsd + (order.buyerPaidAt ? order.priceUsd : 0);
}

/**
 * The part of a failed deal's hold that the platform keeps.
 *
 * A Safest fee pays for the agent taking custody, so once custody is reached
 * it is earned even if the deal goes no further — /fees says so. A Fastest
 * deal that did not happen earns nothing, and custody is a Safest stamp.
 */
export function keptFee(order: {
  mode: DealMode;
  custodyAt: Date | null;
  buyerFeeUsd: number;
}): number {
  return order.mode === "SAFEST" && order.custodyAt ? order.buyerFeeUsd : 0;
}
