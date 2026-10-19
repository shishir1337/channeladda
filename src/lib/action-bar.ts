/**
 * Pages that draw their own phone action bar, where the site's would cover it.
 *
 * On a listing the site's bar offered "Browse accounts / Sell" to someone
 * already looking at an account they might buy; the listing's own bar shows
 * its price and the way to start a deal instead.
 */
export function hasOwnActionBar(pathname: string): boolean {
  return pathname.startsWith("/listing/");
}
