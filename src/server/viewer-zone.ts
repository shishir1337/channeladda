import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { TZ_COOKIE, type ViewerZone, zoneFromCookie } from "@/lib/time";

/**
 * The zone the person reading this page lives in, from the cookie their
 * browser keeps (`TimeZoneProvider`); India time, labelled, until it has.
 *
 * Reading a cookie makes a page dynamic, so this belongs on signed-in pages
 * — already dynamic — and never on the public, revalidated ones.
 */
export const viewerZone = cache(async (): Promise<ViewerZone> => {
  const store = await cookies();
  return zoneFromCookie(store.get(TZ_COOKIE)?.value);
});
