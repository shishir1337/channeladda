/**
 * "1 review", "2 reviews", "1,204 listings": a count with its noun, the
 * thousands marked. The public site said "1 reviews" and "1 sales" before
 * this was shared.
 */
export function countOf(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
}
