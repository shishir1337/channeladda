export type RevenueLine =
  | { kind: "revenue"; usd: number }
  | { kind: "monetized" }
  | { kind: "none" };

/**
 * What a listing card says about money. Monetization is the seller's stated
 * fact and revenue a figure they may leave at zero, so "Not monetized" comes
 * from the first, never from a missing second.
 */
export function revenueLine(listing: {
  monetized: boolean;
  monthlyRevenue: number;
}): RevenueLine {
  if (!listing.monetized) return { kind: "none" };
  return listing.monthlyRevenue > 0
    ? { kind: "revenue", usd: listing.monthlyRevenue }
    : { kind: "monetized" };
}
