"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { useSession } from "@/lib/auth-client";
import type { MemberCounts } from "@/lib/site-dock";

/**
 * What is waiting on the signed-in member — deals and unread chats — for
 * the website's chrome: the phone's tab bar, the account menu and the
 * messages button. Fetched once here and shared, rather than once by each.
 *
 * The pages are static, so it comes from `/api/waiting` in the browser, as
 * the balance does. Asked again on each page and when the tab regains
 * focus: a step taken elsewhere may have changed what is waiting. Null
 * while signed out or still loading.
 */
const MemberCountsContext = createContext<MemberCounts | null>(null);

export function MemberCountsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const signedIn = Boolean(session?.user);
  const [counts, setCounts] = useState<MemberCounts | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger here, not a value the body reads
  useEffect(() => {
    if (!signedIn) {
      setCounts(null);
      return;
    }
    let live = true;
    const load = async () => {
      try {
        const response = await fetch("/api/waiting", { cache: "no-store" });
        const body = (await response.json()) as MemberCounts;
        if (live) setCounts(body);
      } catch {
        // A count that fails to load is left off, not an error.
      }
    };
    void load();
    window.addEventListener("focus", load);
    return () => {
      live = false;
      window.removeEventListener("focus", load);
    };
  }, [signedIn, pathname]);

  return (
    <MemberCountsContext.Provider value={signedIn ? counts : null}>
      {children}
    </MemberCountsContext.Provider>
  );
}

export function useMemberCounts(): MemberCounts | null {
  return useContext(MemberCountsContext);
}
