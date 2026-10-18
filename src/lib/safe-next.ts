/**
 * Where to send someone after they sign in or up, from a `?next=` value.
 *
 * Only a path on this site. "Starts with a slash" is not enough: `//host` is
 * a protocol-relative URL to another site, and `/\host` is read the same way
 * by browsers. Anything else — a full URL, a `javascript:` link, an array
 * from a repeated parameter — falls back.
 */
export function safeNext(next: unknown, fallback = "/dashboard"): string {
  if (typeof next !== "string") return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
