import type { FeeSettings } from "@/lib/fees";

/**
 * Rating points and the Reseller badge, as rules.
 *
 * The owner's terms (2026-10-20): every completed deal earns half its worth
 * in points, for the buyer and the seller alike — a $500 deal is 250 points.
 * The Reseller badge, bought 30 days at a time, shows beside the holder's
 * name, multiplies their points while it is active, and takes a share off
 * every Channel Adda fee they pay. Price, discount and multiplier are admin
 * settings; these are their defaults. Pure, so each rule is pinned by a test.
 */

export const RESELLER_DAYS = 30;

export const RESELLER_DEFAULTS = Object.freeze({
  /** Cents, for 30 days. */
  priceUsd: 2_000,
  /** Basis points off every fee the holder pays. */
  discountBp: 3_000,
  /** How many times their points count while the badge is active. */
  pointsMultiplier: 3,
});

/**
 * Points for this much completed trade, in whole points.
 *
 * Derived from the deals every time rather than stored, so they cannot drift
 * from what happened, and the multiplier applies to everything earned — the
 * owner's example is 250 becoming 750 the moment the badge is bought.
 */
export function ratingPoints(input: {
  worthCents: number;
  multiplier: number;
}): number {
  return Math.floor(input.worthCents / 200) * input.multiplier;
}

/** The fee rates a deal is opened at, with each side's badge applied. */
export function withResellerDiscount(
  fees: FeeSettings,
  badge: { buyer: boolean; seller: boolean },
  discountBp: number,
): FeeSettings {
  const off = (bp: number) => Math.round((bp * (10_000 - discountBp)) / 10_000);
  return {
    buyerFeeBpSafest: badge.buyer
      ? off(fees.buyerFeeBpSafest)
      : fees.buyerFeeBpSafest,
    buyerFeeBpFastest: badge.buyer
      ? off(fees.buyerFeeBpFastest)
      : fees.buyerFeeBpFastest,
    sellerFeeBp: badge.seller ? off(fees.sellerFeeBp) : fees.sellerFeeBp,
  };
}

/**
 * When a new pass runs: from the end of the one still running, so paying
 * early extends it, or from now when there is none.
 */
export function nextPassPeriod(
  currentEnd: Date | null,
  now: Date,
): { startsAt: Date; endsAt: Date } {
  const startsAt =
    currentEnd && currentEnd.getTime() > now.getTime() ? currentEnd : now;
  return {
    startsAt,
    endsAt: new Date(startsAt.getTime() + RESELLER_DAYS * 86_400_000),
  };
}
