import "server-only";

import { db } from "@/lib/db";
import type { FeeSettings } from "@/lib/fees";
import { ratingPoints, withResellerDiscount } from "@/lib/reseller";
import { getSettings } from "@/server/settings";
import { trackRecord } from "@/server/track-record";

/**
 * Who holds the Reseller badge, and what it does for them: read-only, and
 * apart from buying one (`@/server/reseller`) so the deal code can apply
 * the discount without depending on the wallet.
 */

export type ResellerStatus = { active: boolean; endsAt: Date | null };

/**
 * Whether a pass covers now, and when the badge ends: passes are bought
 * end to end, so the last one still to end is where it stops.
 */
export async function resellerStatus(
  userId: string,
  now: Date = new Date(),
): Promise<ResellerStatus> {
  const [covering, last] = await Promise.all([
    db.resellerPass.count({
      where: { userId, startsAt: { lte: now }, endsAt: { gt: now } },
    }),
    db.resellerPass.findFirst({
      where: { userId, endsAt: { gt: now } },
      orderBy: { endsAt: "desc" },
      select: { endsAt: true },
    }),
  ]);
  return covering > 0
    ? { active: true, endsAt: last?.endsAt ?? null }
    : { active: false, endsAt: null };
}

/** Of these people, the ones holding the badge now. For lists of names. */
export async function activeResellers(
  userIds: readonly string[],
  now: Date = new Date(),
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await db.resellerPass.findMany({
    where: {
      userId: { in: [...userIds] },
      startsAt: { lte: now },
      endsAt: { gt: now },
    },
    select: { userId: true },
    distinct: ["userId"],
  });
  return new Set(rows.map((row) => row.userId));
}

export type Rating = {
  points: number;
  reseller: boolean;
  /** When the badge ends, while it is active. */
  endsAt: Date | null;
};

/** Someone's rating points, with the badge's multiplier while it lasts. */
export async function ratingFor(userId: string): Promise<Rating> {
  const [record, status, settings] = await Promise.all([
    trackRecord(userId),
    resellerStatus(userId),
    getSettings(),
  ]);
  return {
    points: ratingPoints({
      worthCents: record.worthCents,
      multiplier: status.active ? settings.resellerPointsMultiplier : 1,
    }),
    reseller: status.active,
    endsAt: status.endsAt,
  };
}

/**
 * The fee rates a deal opens at: the platform's, with the buyer's and the
 * seller's badge each taking its share off the fee that side pays.
 */
export async function dealFees(
  buyerId: string,
  sellerId: string,
  settings: FeeSettings & { resellerDiscountBp: number },
): Promise<FeeSettings> {
  const holders = await activeResellers([buyerId, sellerId]);
  return withResellerDiscount(
    settings,
    { buyer: holders.has(buyerId), seller: holders.has(sellerId) },
    settings.resellerDiscountBp,
  );
}
