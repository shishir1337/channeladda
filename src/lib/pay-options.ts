/**
 * How a buyer can pay an amount from their Channel Adda balance.
 *
 * All in cents. A balance that covers it pays it outright. A balance that
 * is short but not empty can be topped up by exactly the difference — the
 * top-up's own floor of $10 and ceiling of $10,000 still apply — after which
 * the balance covers it. Splitting one payment between the balance and an
 * invoice is deliberately not offered: one payment, one name, one place it
 * can be booked twice.
 */
export const TOP_UP_MIN_CENTS = 1_000;
export const TOP_UP_MAX_CENTS = 1_000_000;

export type BalanceRoute =
  | { kind: "balance" }
  | { kind: "top-up"; topUpUsd: number }
  | { kind: "invoice-only" };

export function balanceRoute(
  availableUsd: number,
  amountUsd: number,
): BalanceRoute {
  if (availableUsd >= amountUsd) return { kind: "balance" };
  if (availableUsd <= 0) return { kind: "invoice-only" };
  const topUpUsd = Math.max(amountUsd - availableUsd, TOP_UP_MIN_CENTS);
  return topUpUsd <= TOP_UP_MAX_CENTS
    ? { kind: "top-up", topUpUsd }
    : { kind: "invoice-only" };
}
