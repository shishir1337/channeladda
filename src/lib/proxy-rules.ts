import { safeNext } from "@/lib/safe-next";

/**
 * The decisions `src/proxy.ts` makes, without the framework around them.
 *
 * The platform ids are written out rather than read from `data/platforms`,
 * which brings every brand icon with it; the proxy runs on every matching
 * request and should load nothing it does not use. A test keeps the two
 * lists the same.
 */
export const PLATFORM_IDS = [
  "youtube",
  "instagram",
  "facebook",
  "telegram",
  "website",
] as const;

/** Where the staff area's address is handed to its layout. */
export const PATH_HEADER = "x-channeladda-path";

/**
 * For /browse/<something that is not a platform>, an address no route
 * matches — so the not-found page renders with a 404 — and null for
 * anything else.
 */
export function unknownPlatformPath(pathname: string): string | null {
  const match = /^\/browse\/([^/]+)\/?$/.exec(pathname);
  if (!match) return null;
  const id = decodeURIComponentSafe(match[1]);
  if ((PLATFORM_IDS as readonly string[]).includes(id)) return null;
  return "/browse/_/not-found";
}

/**
 * Where sign-in should bring a signed-out visitor back to in the staff
 * area: the page they opened, if the header says one, or its front page.
 */
export function adminNext(header: string | null): string {
  const next = safeNext(header, "/admin");
  return next === "/admin" ||
    next.startsWith("/admin/") ||
    next.startsWith("/admin?")
    ? next
    : "/admin";
}

function decodeURIComponentSafe(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}
