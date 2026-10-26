"use client";

import { useRouter } from "next/navigation";
import { createContext, type ReactNode, useContext, useEffect } from "react";
import {
  dayAndTime,
  isTimeZone,
  SITE_ZONE,
  TZ_COOKIE,
  type ViewerZone,
} from "@/lib/time";

/**
 * The reader's time zone, for Client Components.
 *
 * The server reads it from the `tz` cookie and hands it down here, so a
 * time drawn in the browser is the same string the server drew — the chat
 * pages threw React #418 on every load in any zone but the server's, since
 * the server wrote its own clock and the browser rewrote it in the reader's.
 *
 * Outside a provider — the public pages, which are revalidated and cannot
 * read a cookie — it is India time, labelled.
 */
const ZoneContext = createContext<ViewerZone>(SITE_ZONE);

export function useViewerZone(): ViewerZone {
  return useContext(ZoneContext);
}

/** The browser's own zone, when it gives a real one. */
function browserZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isTimeZone(zone) ? zone : null;
  } catch {
    return null;
  }
}

function savedZone(): string | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${TZ_COOKIE}=([^;]*)`),
  );
  return match ? match[1] : null;
}

/**
 * Writes the browser's zone into the cookie the server reads, and returns
 * it once the cookie holds it — null when the browser gives no zone or
 * keeps no cookies. A name checked by `isTimeZone` needs no encoding.
 */
function rememberZone(): string | null {
  const zone = browserZone();
  if (!zone) return null;
  if (savedZone() !== zone) {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    // biome-ignore lint/suspicious/noDocumentCookie: one plain cookie, written once; the Cookie Store API is not in every browser members use.
    document.cookie = `${TZ_COOKIE}=${zone}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  }
  return savedZone() === zone ? zone : null;
}

/** At most once a page load, so a zone the server refuses cannot loop. */
let refreshed = false;

/**
 * Hands the reader's zone to every Client Component below, and keeps the
 * cookie up to date. When the page was drawn in another zone — a first
 * visit, or the laptop has travelled — the cookie is written and the page
 * drawn again from the server, once, in the reader's own time.
 */
export function TimeZoneProvider({
  zone,
  children,
}: {
  zone: ViewerZone;
  children: ReactNode;
}) {
  const router = useRouter();
  const { timeZone, labelled } = zone;

  useEffect(() => {
    const saved = rememberZone();
    if (!saved || refreshed) return;
    if (labelled || saved !== timeZone) {
      refreshed = true;
      router.refresh();
    }
  }, [labelled, timeZone, router]);

  return <ZoneContext.Provider value={zone}>{children}</ZoneContext.Provider>;
}

/**
 * A `<time>` whose hover title is the moment in the reader's zone, for a
 * component drawn from both Server and Client Components. What it shows —
 * "3h ago" — is the caller's.
 */
export function ZonedTime({
  at,
  className,
  children,
  suppressHydrationWarning,
}: {
  at: Date;
  className?: string;
  children: ReactNode;
  /** For a relative label that can tick between the two renders. */
  suppressHydrationWarning?: boolean;
}) {
  const zone = useViewerZone();
  return (
    <time
      dateTime={at.toISOString()}
      title={dayAndTime(at, zone)}
      className={className}
      suppressHydrationWarning={suppressHydrationWarning}
    >
      {children}
    </time>
  );
}

/**
 * Only the cookie, for the public pages: no zone to hand down there, but a
 * member who arrives at the dashboard from them finds it already drawn in
 * their own time.
 */
export function TimeZoneCookie() {
  useEffect(() => {
    rememberZone();
  }, []);
  return null;
}
