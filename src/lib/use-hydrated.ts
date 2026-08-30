"use client";

import { useEffect, useState } from "react";

/**
 * False until the component has mounted in the browser.
 *
 * Anything whose markup depends on the session has to wait for this. Better
 * Auth's `useSession` reports `isPending` during the server render, so the
 * HTML says "Checking your account…" — but by the time React hydrates, the
 * session is often already resolved, so the first client render disagrees with
 * the server and React throws the whole subtree away and rebuilds it.
 *
 * Gating on mount makes the first client render identical to the server's by
 * construction. The swap then happens in a second render, which is a normal
 * update rather than a hydration failure.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
