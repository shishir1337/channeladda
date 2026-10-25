/**
 * Who comes first on /sellers.
 *
 * The owner's rule (2026-10-26): every seller, by rating points, the most at
 * the top. Points are the ones the rest of the site shows (`ratingPoints`),
 * so the number beside a name here is the number on their own page.
 *
 * Two sellers on the same points are told apart by more completed sales
 * first, then by who joined earlier, then by their address on the site, so
 * the order is the same on every load of the page and nobody shares a place.
 * Pure, so the order is pinned by a test.
 */

export type RankInput = {
  slug: string;
  points: number;
  /** Completed sales as the seller. */
  sales: number;
  joinedAt: Date;
};

/** Negative when `a` ranks above `b`. */
export function compareForRank(a: RankInput, b: RankInput): number {
  return (
    b.points - a.points ||
    b.sales - a.sales ||
    a.joinedAt.getTime() - b.joinedAt.getTime() ||
    (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0)
  );
}

/** The sellers in rank order, each with their place: 1 for the top. */
export function rankSellers<T extends RankInput>(
  sellers: readonly T[],
): (T & { rank: number })[] {
  return [...sellers]
    .sort(compareForRank)
    .map((seller, i) => ({ ...seller, rank: i + 1 }));
}

export type Medal = "gold" | "silver" | "bronze";

const MEDALS: readonly Medal[] = ["gold", "silver", "bronze"];

/**
 * Gold, silver and bronze for the top three, once they have earned points.
 * A medal for nothing would mean nothing: before any deal has completed,
 * the first three are only the earliest to join.
 */
export function medalFor(rank: number, points: number): Medal | null {
  if (points <= 0) return null;
  return MEDALS[rank - 1] ?? null;
}

/** "1st", "2nd", "3rd", "4th", "11th", "21st", "112th". */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
