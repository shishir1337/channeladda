"use client";

import { SearchIcon, TagIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Bottom action bar on small screens only. Appears once the hero search has
 * scrolled away so the two primary paths stay one tap from anywhere.
 */
export function MobileActionBar() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 720);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/92 backdrop-blur-xl transition-transform duration-300 ease-[var(--ease-out-soft)] lg:hidden",
        visible ? "translate-y-0" : "translate-y-full",
      )}
      // Clears the iOS home indicator / Android gesture bar.
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-hidden={!visible}
    >
      <div className="flex gap-2.5 px-4 py-3">
        <Button asChild size="md" className="flex-1">
          <Link href="/browse" tabIndex={visible ? undefined : -1}>
            <SearchIcon aria-hidden="true" className="size-4" />
            Browse accounts
          </Link>
        </Button>
        <Button asChild variant="secondary" size="md" className="flex-1">
          <Link href="/sell" tabIndex={visible ? undefined : -1}>
            <TagIcon aria-hidden="true" className="size-4" />
            Sell
          </Link>
        </Button>
      </div>
    </div>
  );
}
