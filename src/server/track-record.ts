import "server-only";

import { db } from "@/lib/db";
import { emptyRecord, type TrackRecord } from "@/lib/track-record";

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
