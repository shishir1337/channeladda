import "server-only";

import { db } from "@/lib/db";
import { DEFAULT_FEES, type FeeSettings, MAX_FEE_BP } from "@/lib/fees";

/**
 * Platform settings.
 *
 * One row. Read on every page that quotes a price, so it is cached for a few
 * seconds — long enough that a listing page does not query it three times,
 * short enough that a rate change is visible almost immediately. Pages that
 * show fees are also revalidated explicitly when the rates change, so the
 * cache is a performance detail rather than the thing keeping them correct.
 */
const CACHE_MS = 10_000;

const globalForSettings = globalThis as unknown as {
  settingsCache?: { at: number; value: PlatformSettings };
};

export type PlatformSettings = FeeSettings & {
  /** How long an offer stands before it lapses. */
  offerExpiryHours: number;
  /** How many Safest channels one agent may hold at once. */
  maxHoldsPerAgent: number;
  /** Cents. At or above this, handing value across needs a second approval. */
  secondApprovalAboveUsd: number;
  updatedAt: Date | null;
  updatedByName: string | null;
};

const DEFAULT_OFFER_EXPIRY_HOURS = 48;
const DEFAULT_MAX_HOLDS_PER_AGENT = 10;
const DEFAULT_SECOND_APPROVAL_ABOVE_USD = 500_000;

/**
 * Throws away the cached row.
 *
 * `updateSettings` does this inline, but anything else that writes the table
 * behind this module's back — a migration, a seed, a test harness truncating
 * it — has to say so, or reads keep serving a row that no longer exists.
 */
export function clearSettingsCache() {
  globalForSettings.settingsCache = undefined;
}

export async function getSettings(): Promise<PlatformSettings> {
  const cached = globalForSettings.settingsCache;
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  const row = await db.platformSettings.findUnique({
    where: { id: "singleton" },
    select: {
      buyerFeeBpSafest: true,
      buyerFeeBpFastest: true,
      sellerFeeBp: true,
      maxHoldsPerAgent: true,
      secondApprovalAboveUsd: true,
      offerExpiryHours: true,
      updatedAt: true,
      updatedBy: { select: { name: true } },
    },
  });

  // A missing row means a database that has not been migrated or seeded. Fall
  // back to what the code shipped with rather than showing a zero fee, which
  // would be a very expensive way to fail.
  const value: PlatformSettings = row
    ? {
        buyerFeeBpSafest: row.buyerFeeBpSafest,
        buyerFeeBpFastest: row.buyerFeeBpFastest,
        sellerFeeBp: row.sellerFeeBp,
        maxHoldsPerAgent: row.maxHoldsPerAgent,
        secondApprovalAboveUsd: row.secondApprovalAboveUsd,
        offerExpiryHours: row.offerExpiryHours,
        updatedAt: row.updatedAt,
        updatedByName: row.updatedBy?.name ?? null,
      }
    : {
        ...DEFAULT_FEES,
        maxHoldsPerAgent: DEFAULT_MAX_HOLDS_PER_AGENT,
        secondApprovalAboveUsd: DEFAULT_SECOND_APPROVAL_ABOVE_USD,
        offerExpiryHours: DEFAULT_OFFER_EXPIRY_HOURS,
        updatedAt: null,
        updatedByName: null,
      };

  globalForSettings.settingsCache = { at: Date.now(), value };
  return value;
}

/** Only the numbers, for passing into a Client Component. */
export async function getFeeSettings(): Promise<FeeSettings> {
  const { buyerFeeBpSafest, buyerFeeBpFastest, sellerFeeBp } =
    await getSettings();
  return { buyerFeeBpSafest, buyerFeeBpFastest, sellerFeeBp };
}

export type SettingsInput = {
  buyerFeeBpSafest: number;
  buyerFeeBpFastest: number;
  sellerFeeBp: number;
  maxHoldsPerAgent: number;
  /** Dollars, as typed into the form. Stored as cents. */
  secondApprovalAbove: number;
  offerExpiryHours: number;
};

export type SettingsError = { field: string; message: string };

/**
 * Validation lives here rather than only in the form.
 *
 * A fee is the one number on this platform where a typo costs real money on
 * every sale until someone notices, so the bounds are deliberately tight and
 * the ceiling is well below anything a legitimate change would need.
 */
export function validateSettings(input: SettingsInput): SettingsError[] {
  const errors: SettingsError[] = [];

  for (const [field, bp] of [
    ["buyerFeeBpSafest", input.buyerFeeBpSafest],
    ["buyerFeeBpFastest", input.buyerFeeBpFastest],
    ["sellerFeeBp", input.sellerFeeBp],
  ] as const) {
    if (!Number.isFinite(bp)) {
      errors.push({ field, message: "Enter a percentage." });
    } else if (!Number.isInteger(bp)) {
      errors.push({ field, message: "Use at most two decimal places." });
    } else if (bp < 0) {
      errors.push({ field, message: "A fee cannot be negative." });
    } else if (bp > MAX_FEE_BP) {
      errors.push({
        field,
        message: `That is over ${MAX_FEE_BP / 100}%. If that is really intended, it needs a code change.`,
      });
    }
  }

  // Zero would refuse every assignment and read, from the outside, as the
  // whole platform being broken rather than as a setting.
  if (!Number.isInteger(input.maxHoldsPerAgent) || input.maxHoldsPerAgent < 1) {
    errors.push({
      field: "maxHoldsPerAgent",
      message: "At least 1. An agent who can hold nothing blocks every deal.",
    });
  }

  if (
    !Number.isFinite(input.secondApprovalAbove) ||
    input.secondApprovalAbove < 0
  ) {
    errors.push({
      field: "secondApprovalAbove",
      message: "Enter an amount, or 0 to require approval on every handover.",
    });
  }

  if (
    !Number.isInteger(input.offerExpiryHours) ||
    input.offerExpiryHours < 1 ||
    input.offerExpiryHours > 720
  ) {
    errors.push({
      field: "offerExpiryHours",
      message: "Between 1 hour and 30 days.",
    });
  }

  return errors;
}

export async function updateSettings(input: SettingsInput, actorId: string) {
  const errors = validateSettings(input);
  if (errors.length > 0) return { ok: false as const, errors };

  const before = await db.platformSettings.findUnique({
    where: { id: "singleton" },
    select: {
      buyerFeeBpSafest: true,
      buyerFeeBpFastest: true,
      sellerFeeBp: true,
      maxHoldsPerAgent: true,
      secondApprovalAboveUsd: true,
      offerExpiryHours: true,
    },
  });

  const data = {
    buyerFeeBpSafest: input.buyerFeeBpSafest,
    buyerFeeBpFastest: input.buyerFeeBpFastest,
    sellerFeeBp: input.sellerFeeBp,
    maxHoldsPerAgent: input.maxHoldsPerAgent,
    secondApprovalAboveUsd: Math.round(input.secondApprovalAbove * 100),
    offerExpiryHours: input.offerExpiryHours,
    updatedById: actorId,
  };

  await db.platformSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });

  globalForSettings.settingsCache = undefined;

  return { ok: true as const, before, after: data };
}
