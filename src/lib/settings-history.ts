/** What each stored setting is called in the change history. */
const FIELD_LABEL: Record<string, string> = {
  buyerFeeBp: "Buyer fee (single rate, since split)",
  buyerFeeBpSafest: "Buyer fee, Safest",
  buyerFeeBpFastest: "Buyer fee, Fastest",
  sellerFeeBp: "Seller fee",
  maxHoldsPerAgent: "Channels one agent may hold",
  secondApprovalAboveUsd: "Second approval above",
  offerExpiryHours: "Offers expire after",
  minWithdrawalUsd: "Smallest withdrawal",
  paymentWindowHours: "Payment window",
  resellerPriceUsd: "Reseller badge price",
  resellerDiscountBp: "Reseller discount",
  resellerPointsMultiplier: "Reseller points multiplier",
  googleReviewUrl: "Google review link",
};

/**
 * The row's own bookkeeping, not a setting: who saved it is the "Who"
 * column already, and the sweep's last run is not somebody's change. QA
 * found a user id under "updatedById" in the history.
 */
const NOT_SETTINGS = new Set([
  "id",
  "updatedAt",
  "updatedById",
  "lastSweepAt",
  "lastSweepResult",
]);

const HOURS = new Set(["offerExpiryHours", "paymentWindowHours"]);

/** Basis points as a percentage, cents as dollars, hours as hours. */
function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "not set";
  if (typeof value !== "number") return String(value);
  if (key.includes("Bp")) return `${value / 100}%`;
  if (key.endsWith("Usd")) {
    return (value / 100).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  if (HOURS.has(key)) return `${value} hours`;
  if (key === "resellerPointsMultiplier") return `${value}×`;
  return value.toLocaleString("en-US");
}

/**
 * What actually moved between two audit snapshots of the settings.
 *
 * Diffed over whatever keys the snapshots carry, so a setting added later
 * shows up without anyone remembering this list (it reads by its stored
 * name until it is given a plain one here).
 */
export function settingsDiff(before: unknown, after: unknown) {
  const from = (before ?? {}) as Record<string, unknown>;
  const to = (after ?? {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(from), ...Object.keys(to)])];
  return keys
    .filter((key) => !NOT_SETTINGS.has(key) && from[key] !== to[key])
    .map((key) => ({
      key,
      label: FIELD_LABEL[key] ?? key,
      from: formatValue(key, from[key]),
      to: formatValue(key, to[key]),
    }));
}
