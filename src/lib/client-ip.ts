/**
 * The visitor's address, as far as it can be trusted.
 *
 * The site runs behind Cloudflare and then nginx. Cloudflare writes the
 * visitor into CF-Connecting-IP, replacing anything the browser sent; nginx
 * writes whoever connected to it into X-Real-IP. X-Forwarded-For is a list
 * the browser can start, so only a single entry is believed.
 *
 * The same order is given to Better Auth for its rate limits in
 * `src/lib/auth.ts`.
 */
export const CLIENT_IP_HEADERS = [
  "cf-connecting-ip",
  "x-real-ip",
  "x-forwarded-for",
] as const;

export function clientIp(headers: Headers): string | null {
  for (const name of CLIENT_IP_HEADERS) {
    const value = headers.get(name)?.trim();
    if (!value) continue;
    if (name === "x-forwarded-for" && value.includes(",")) continue;
    return value;
  }
  return null;
}
