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
  updatedAt: Date | null;
  updatedByName: string | null;
};

const DEFAULT_OFFER_EXPIRY_HOURS = 48;

export async function getSettings(): Promise<PlatformSettings> {
  const cached = globalForSettings.settingsCache;
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  const row = await db.platformSettings.findUnique({
    where: { id: "singleton" },
    select: {
      buyerFeeBp: true,
      sellerFeeBp: true,
      escrowRequiredAboveUsd: true,
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
        buyerFeeBp: row.buyerFeeBp,
        sellerFeeBp: row.sellerFeeBp,
        escrowRequiredAbove: row.escrowRequiredAboveUsd / 100,
        offerExpiryHours: row.offerExpiryHours,
        updatedAt: row.updatedAt,
        updatedByName: row.updatedBy?.name ?? null,
      }
    : {
        ...DEFAULT_FEES,
        offerExpiryHours: DEFAULT_OFFER_EXPIRY_HOURS,
        updatedAt: null,
        updatedByName: null,
      };

  globalForSettings.settingsCache = { at: Date.now(), value };
  return value;
}

/** Only the numbers, for passing into a Client Component. */
export async function getFeeSettings(): Promise<FeeSettings> {
  const { buyerFeeBp, sellerFeeBp, escrowRequiredAbove } = await getSettings();
  return { buyerFeeBp, sellerFeeBp, escrowRequiredAbove };
}

export type SettingsInput = {
  buyerFeeBp: number;
  sellerFeeBp: number;
  /** Dollars, as typed into the form. */
  escrowRequiredAbove: number;
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
    ["buyerFeeBp", input.buyerFeeBp],
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

  if (
    !Number.isFinite(input.escrowRequiredAbove) ||
    input.escrowRequiredAbove < 0
  ) {
    errors.push({
      field: "escrowRequiredAbove",
      message: "Enter an amount, or 0 to make escrow mandatory on everything.",
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
      buyerFeeBp: true,
      sellerFeeBp: true,
      escrowRequiredAboveUsd: true,
      offerExpiryHours: true,
    },
  });

  const data = {
    buyerFeeBp: input.buyerFeeBp,
    sellerFeeBp: input.sellerFeeBp,
    escrowRequiredAboveUsd: Math.round(input.escrowRequiredAbove * 100),
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
