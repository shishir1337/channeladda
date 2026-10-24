/**
 * Which tab a page opens on: the one asked for in the address, else the
 * first in `order` with anything in it, else the first of all.
 */
export function pickTab<T extends string>(
  asked: string | undefined,
  order: readonly T[],
  counts: Record<T, number>,
): T {
  if (order.includes(asked as T)) return asked as T;
  return order.find((tab) => counts[tab] > 0) ?? order[0];
}
