import "server-only";

import { db } from "@/lib/db";
import { ratingPoints } from "@/lib/reseller";
import { emptyRecord, type TrackRecord } from "@/lib/track-record";
import { activeResellers } from "@/server/reseller-status";
import { getSettings } from "@/server/settings";

export type { TrackRecord } from "@/lib/track-record";

/**
 * What somebody has actually done here, for the other side to weigh up
 * before agreeing a deal with them.
 *
 * Completed deals only, as buyer or as seller: a deal still running proves
 * nothing yet, and one refunded or cancelled is not a trade. Worth is the
 * agreed price, not the total with fees, because the price is what changed
 * hands. Derived every time from the orders themselves, like the seller
 * figures on /sellers, so it cannot be inflated by editing a profile.
 */
export async function trackRecord(userId: string): Promise<TrackRecord> {
  const rows = await db.order.groupBy({
    by: ["mode", "buyerId"],
    where: {
      status: "COMPLETED",
      OR: [{ buyerId: userId }, { sellerId: userId }],
    },
    _count: { _all: true },
    _sum: { priceUsd: true },
  });

  const record = emptyRecord();
  for (const row of rows) {
    const deals = row._count._all;
    const worth = row._sum.priceUsd ?? 0;
    record.deals += deals;
    record.worthCents += worth;
    const mode = row.mode === "SAFEST" ? record.safest : record.fastest;
    mode.deals += deals;
    mode.worthCents += worth;
    // Nobody can buy their own listing, so a row is one side or the other.
    if (row.buyerId === userId) record.asBuyer += deals;
    else record.asSeller += deals;
  }
  return record;
}

/**
 * Rating points for a page of people at once — every card on /browse — in
 * the same few queries however many there are. Same rule as a profile:
 * completed deals on either side, multiplied while a Reseller badge lasts.
 * Everyone asked for is in the map, at 0 if they have not dealt yet.
 */
export async function ratingPointsFor(
  userIds: readonly string[],
): Promise<Map<string, number>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();

  const [sold, bought, holders, settings] = await Promise.all([
    db.order.groupBy({
      by: ["sellerId"],
      where: { status: "COMPLETED", sellerId: { in: ids } },
      _sum: { priceUsd: true },
    }),
    db.order.groupBy({
      by: ["buyerId"],
      where: { status: "COMPLETED", buyerId: { in: ids } },
      _sum: { priceUsd: true },
    }),
    activeResellers(ids),
    getSettings(),
  ]);

  const worth = new Map<string, number>();
  for (const row of sold) {
    worth.set(
      row.sellerId,
      (row._sum.priceUsd ?? 0) + (worth.get(row.sellerId) ?? 0),
    );
  }
  for (const row of bought) {
    worth.set(
      row.buyerId,
      (row._sum.priceUsd ?? 0) + (worth.get(row.buyerId) ?? 0),
    );
  }

  return new Map(
    ids.map((id) => [
      id,
      ratingPoints({
        worthCents: worth.get(id) ?? 0,
        multiplier: holders.has(id) ? settings.resellerPointsMultiplier : 1,
      }),
    ]),
  );
}
