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
 *
 * Every calculation also takes the deal's mode, because the two modes charge
 * differently and the difference is not cosmetic:
 *
 * - **Safest** — the buyer pays Channel Adda the admin fee and nothing else.
 *   The price goes straight from buyer to seller, once our agent holds the
 *   channel, and never passes through the platform — so there is nothing to
 *   deduct a seller fee from and `totalUsd` is the fee alone.
 * - **Fastest** — the buyer pays the price and the fee together, the platform
 *   holds it, and the seller is credited the price less the seller fee.
 */

import type { DealMode } from "@/generated/prisma/enums";

export type FeeSettings = {
  /** Added on top of the price, paid by the buyer, on a Safest deal. */
  buyerFeeBpSafest: number;
  /** The same, on a Fastest deal. Set separately: Fastest is more work for
   *  the platform and it carries the funds, so it may be priced higher. */
  buyerFeeBpFastest: number;
  /** Deducted before the seller is credited. Only ever applies to Fastest. */
  sellerFeeBp: number;
};

/** What the code ships with, and what a fresh database starts at: 5% from
 *  the buyer on either deal (the owner, 2026-10-26; it was 3%). */
export const DEFAULT_FEES: FeeSettings = {
  buyerFeeBpSafest: 500,
  buyerFeeBpFastest: 500,
  sellerFeeBp: 0,
};

export const MAX_FEE_BP = 3000; // 30%, an obvious-mistake ceiling

/** 300 -> "3", 275 -> "2.75". Trailing zeros trimmed. */
export function formatRate(bp: number): string {
  return String(Number((bp / 100).toFixed(2)));
}

function applyBp(cents: number, bp: number) {
  return Math.round((cents * bp) / 10_000);
}

function buyerBpFor(fees: FeeSettings, mode: DealMode) {
  return mode === "FASTEST" ? fees.buyerFeeBpFastest : fees.buyerFeeBpSafest;
}

/**
 * A full quote for one price, in dollars in and dollars out.
 *
 * The arithmetic runs in integer cents and converts back at the edge, so a
 * $99 sale at 3% is $2.97 rather than $3 — the old version rounded the fee to
 * whole dollars, which was harmless while this was display-only and would not
 * have been once it reached a charge.
 */
export function quote(price: number, fees: FeeSettings, mode: DealMode) {
  const amounts = orderAmounts(Math.round(price * 100), fees, mode);

  return {
    price,
    buyerFee: amounts.buyerFeeUsd / 100,
    total: amounts.totalUsd / 100,
    sellerFee: amounts.sellerFeeUsd / 100,
    payout: amounts.payoutUsd / 100,
  };
}

/** What the buyer owes the platform up front. */
export function buyerTotal(price: number, fees: FeeSettings, mode: DealMode) {
  const q = quote(price, fees, mode);
  return { price: q.price, fee: q.buyerFee, total: q.total };
}

/**
 * What the seller receives.
 *
 * Only meaningful for Fastest, where the platform pays the seller. On a Safest
 * deal the buyer pays the seller directly and the platform is not in the path,
 * so the payout is the whole price.
 */
export function sellerPayout(price: number, fees: FeeSettings, mode: DealMode) {
  const q = quote(price, fees, mode);
  return { price: q.price, fee: q.sellerFee, payout: q.payout };
}

/**
 * The cents an order should record. Orders store amounts, not rates, so a
 * later rate change never rewrites a sale that already happened.
 */
export function orderAmounts(
  priceCents: number,
  fees: FeeSettings,
  mode: DealMode,
) {
  const buyerFeeUsd = applyBp(priceCents, buyerBpFor(fees, mode));
  const sellerFeeUsd =
    mode === "FASTEST" ? applyBp(priceCents, fees.sellerFeeBp) : 0;

  return {
    priceUsd: priceCents,
    buyerFeeUsd,
    sellerFeeUsd,
    // A Safest buyer is charged the fee and nothing else; the price reaches
    // the seller without the platform touching it.
    totalUsd: mode === "FASTEST" ? priceCents + buyerFeeUsd : buyerFeeUsd,
    payoutUsd: priceCents - sellerFeeUsd,
  };
}
