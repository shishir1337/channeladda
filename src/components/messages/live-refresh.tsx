"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/** How often an open conversation asks whether anything changed. */
const POLL_MS = 5_000;

/**
 * Keeps an open conversation current.
 *
 * A reply, an answer to an offer or a payment landing used to appear only
 * when the reader reloaded. Now the page asks every few seconds whether
 * anything it is drawn from has changed and redraws when it has. It asks
 * only while the tab is visible — a tab nobody is looking at has nothing to
 * keep current — and once straight away when the reader comes back to it.
 *
 * It stops for good on a 404: the reader is no longer allowed to see the
 * thread, and asking again would only ask again.
 */
export function LiveRefresh({
  conversationId,
  fingerprint,
  url,
}: {
  conversationId: string;
  /** What the server rendered this page from. */
  fingerprint: string;
  /**
   * Where to ask, for a chat that is not a deal conversation — the Escrow
   * Agent. Left out, the conversation's own fingerprint route.
   */
  url?: string;
}) {
  const source =
    url ??
    `/api/conversations/${encodeURIComponent(conversationId)}/fingerprint`;
  const router = useRouter();
  // The latest one the page was drawn from. A ref, so a refresh that brings
  // a new value does not tear the timer down and start it again.
  const current = useRef(fingerprint);
  useEffect(() => {
    current.current = fingerprint;
  }, [fingerprint]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;

    async function check() {
      if (stopped || inFlight || document.visibilityState !== "visible") {
        return;
      }
      inFlight = true;
      try {
        const response = await fetch(source, { cache: "no-store" });
        if (response.status === 404) {
          stopped = true;
          return;
        }
        if (!response.ok) return;
        const data = (await response.json()) as { fingerprint?: string };
        if (data.fingerprint && data.fingerprint !== current.current) {
          current.current = data.fingerprint;
          router.refresh();
        }
      } catch {
        // Offline for a moment. The next tick tries again.
      } finally {
        inFlight = false;
      }
    }

    function schedule() {
      if (stopped) return;
      timer = setTimeout(async () => {
        await check();
        schedule();
      }, POLL_MS);
    }

    function onVisible() {
      if (document.visibilityState === "visible") void check();
    }

    schedule();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [source, router]);

  return null;
}
