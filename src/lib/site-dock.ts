/**
 * The tabs of the phone's tab bar on the website.
 *
 * Signed in, it is the dashboard's own bar — Home, Browse, Deals, Messages —
 * so stepping from the account to the marketplace and back changes nothing
 * under the thumb. Signed out, it is the four things a visitor can do
 * without an account. "More" is the fifth in both, and is drawn by the bar.
 *
 * Icons are names, as in the app shell, so this stays a plain module.
 */
export type SiteTabIcon =
  | "home"
  | "overview"
  | "browse"
  | "sell"
  | "signin"
  | "deals"
  | "messages";

export type SiteTab = {
  label: string;
  href: string;
  icon: SiteTabIcon;
  waiting?: number;
};

/** Counts for a signed-in member; left out while they load. */
export type MemberCounts = { deals: number; messages: number };

export function siteTabs(
  pathname: string,
  member: { counts: MemberCounts | null } | null,
): SiteTab[] {
  if (member) {
    return [
      { label: "Home", href: "/dashboard", icon: "overview" },
      { label: "Browse", href: "/browse", icon: "browse" },
      {
        label: "Deals",
        href: "/dashboard/deals",
        icon: "deals",
        waiting: member.counts?.deals,
      },
      {
        label: "Messages",
        href: "/dashboard/messages",
        icon: "messages",
        waiting: member.counts?.messages,
      },
    ];
  }
  return [
    { label: "Home", href: "/", icon: "home" },
    { label: "Browse", href: "/browse", icon: "browse" },
    { label: "Sell", href: "/sell", icon: "sell" },
    { label: "Sign in", href: signInFrom(pathname), icon: "signin" },
  ];
}

/** Signing in from a page comes back to it, as the listing's buttons do. */
function signInFrom(pathname: string): string {
  return pathname === "/"
    ? "/signin"
    : `/signin?next=${encodeURIComponent(pathname)}`;
}

/**
 * Where else a tab is lit. A listing is somewhere Browse led, so Browse
 * stays lit on one, the way a shop's tab does on a product.
 */
const ALSO: Record<string, string[]> = {
  "/browse": ["/listing"],
};

/** Home is lit on itself alone; every other tab on everything beneath it. */
export function isTabActive(pathname: string, href: string): boolean {
  const path = href.split("?")[0];
  if (path === "/" || path === "/dashboard") return pathname === path;
  return [path, ...(ALSO[path] ?? [])].some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );
}
