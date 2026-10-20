import type { DealMode } from "@/generated/prisma/enums";

/**
 * What the platform should be holding for a deal that is still running.
 *
 * Everything a buyer pays Channel Adda is held, in both modes, and only
 * becomes ours or the seller's when it is earned: at completion, at a
 * Fastest deal's custody, or — for a Safest fee — when a deal fails after
 * our agent has done the work. So this is what has been paid in and not yet
 * settled: the whole amount on Fastest until our agent is primary owner,
 * when the seller is paid; the fee on Safest, whose price goes from the
 * buyer to the seller directly — except a Safest deal opened before that
 * change whose price was paid to us (`buyerPaymentRef` set), which still
 * holds it until staff decide it.
 *
 * Settling and every refund check the ledger against this before moving
 * anything, so a deal whose books do not add up stops instead of writing
 * rows that would never net.
 */
export function requiredHold(order: {
  mode: DealMode;
  paymentRef: string | null;
  totalUsd: number;
  buyerFeeUsd: number;
  priceUsd: number;
  buyerPaymentRef: string | null;
  custodyAt: Date | null;
}): number {
  if (order.paymentRef === null) return 0;
  if (order.mode === "FASTEST") return order.custodyAt ? 0 : order.totalUsd;
  return order.buyerFeeUsd + (order.buyerPaymentRef ? order.priceUsd : 0);
}

/**
 * The part of a failed deal's hold that the platform keeps.
 *
 * A Safest fee pays for the agent taking custody, so once custody is reached
 * it is earned even if the deal goes no further — /fees says so. A Fastest
 * deal that did not happen earns nothing, and one that reached custody
 * booked its fee when it paid the seller, so it has nothing left to keep.
 */
export function keptFee(order: {
  mode: DealMode;
  custodyAt: Date | null;
  buyerFeeUsd: number;
}): number {
  return order.mode === "SAFEST" && order.custodyAt ? order.buyerFeeUsd : 0;
}
