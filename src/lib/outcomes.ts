/**
 * Whether ending a deal this way moves money Channel Adda is holding — and so
 * is the finance desk's call, not every moderator's.
 *
 * Completing releases the hold and refunding returns it. Cancelling and
 * returning a channel hand back whatever is still held, in either mode, so
 * once anything was paid they are refunds under other names. A pause decides
 * nothing. One rule for the server's gate and the desk's labels, so the two
 * cannot disagree about which button needs finance.
 */
export function movesHeldMoney(to: string, paid: boolean): boolean {
  if (to === "COMPLETED" || to === "REFUNDED") return true;
  if (to === "CANCELLED" || to === "RETURNED_TO_SELLER") return paid;
  return false;
}
