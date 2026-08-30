/**
 * The fee model.
 *
 * Rates are not constants any more — a superadmin sets them from the admin
 * area, so every calculation takes them as an argument. That is deliberate:
 * with a module-level constant it is far too easy to add a fifth call site
 * that quietly keeps using the old number.
 *
 * Rates are **basis points**: 300 is 3.00%. Integers, because a percentage
 * stored as 0.03 in a money path is how rounding errors begin.
 */

export type FeeSettings = {
  buyerFeeBp: number;
  sellerFeeBp: number;
  /** At or above this many dollars, a deal must use escrow. */
  escrowRequiredAbove: number;
};

/** What the code shipped with, and what a fresh database starts at. */
export const DEFAULT_FEES: FeeSettings = {
  buyerFeeBp: 300,
  sellerFeeBp: 500,
  escrowRequiredAbove: 1000,
};

export const MAX_FEE_BP = 3000; // 30%, an obvious-mistake ceiling

/** 300 -> "3", 275 -> "2.75". Trailing zeros trimmed. */
export function formatRate(bp: number): string {
  return String(Number((bp / 100).toFixed(2)));
}

function applyBp(cents: number, bp: number) {
  return Math.round((cents * bp) / 10_000);
}

/**
 * A full quote for one price, in dollars in and dollars out.
 *
 * The arithmetic runs in integer cents and converts back at the edge, so a
 * $99 sale at 3% is $2.97 rather than $3 — the old version rounded the fee to
 * whole dollars, which was harmless while this was display-only and would not
 * have been once it reached a charge.
 */
export function quote(price: number, fees: FeeSettings) {
  const priceCents = Math.round(price * 100);
  const buyerFeeCents = applyBp(priceCents, fees.buyerFeeBp);
  const sellerFeeCents = applyBp(priceCents, fees.sellerFeeBp);

  return {
    price,
    buyerFee: buyerFeeCents / 100,
    total: (priceCents + buyerFeeCents) / 100,
    sellerFee: sellerFeeCents / 100,
    payout: (priceCents - sellerFeeCents) / 100,
  };
}

/** What the buyer pays: price plus the buyer fee. */
export function buyerTotal(price: number, fees: FeeSettings) {
  const q = quote(price, fees);
  return { price: q.price, fee: q.buyerFee, total: q.total };
}

/** What the seller receives: price minus the seller fee. */
export function sellerPayout(price: number, fees: FeeSettings) {
  const q = quote(price, fees);
  return { price: q.price, fee: q.sellerFee, payout: q.payout };
}

/**
 * The cents an order should record. Orders store amounts, not rates, so a
 * later rate change never rewrites a sale that already happened.
 */
export function orderAmounts(priceCents: number, fees: FeeSettings) {
  const buyerFeeUsd = applyBp(priceCents, fees.buyerFeeBp);
  const sellerFeeUsd = applyBp(priceCents, fees.sellerFeeBp);
  return {
    priceUsd: priceCents,
    buyerFeeUsd,
    sellerFeeUsd,
    totalUsd: priceCents + buyerFeeUsd,
    payoutUsd: priceCents - sellerFeeUsd,
  };
}
