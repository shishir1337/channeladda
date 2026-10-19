"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { cn } from "@/lib/utils";

/**
 * The listing's bar on phones: its price and the way to buy, one tap away
 * once the buy panel has scrolled out of sight. Desktop has the panel in the
 * rail, so this never shows there.
 */
export function ListingBuyBar({
  label,
  price,
  wasPrice,
  targetId,
}: {
  /** "Asking price", or what this viewer's accepted offer is called. */
  label: string;
  /** Dollars: the asking price, or the offer this viewer had accepted. */
  price: number;
  wasPrice?: number;
  /** The phone buy panel this bar scrolls to and hides beside. */
  targetId: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target) return;
    // Shown only while the panel itself is out of view, above or below:
    // two buy buttons on one screen is one too many.
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(!entry.isIntersecting),
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetId]);

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/90 backdrop-blur-xl transition-transform duration-300 ease-[var(--ease-out-soft)] lg:hidden",
        visible ? "translate-y-0" : "translate-y-full",
      )}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-hidden={!visible}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-subtle">{label}</p>
          <p className="flex items-baseline gap-2">
            <Price
              usd={price}
              className="tnum text-lg font-semibold tracking-[-0.01em] text-fg"
            />
            {wasPrice ? (
              <Price
                usd={wasPrice}
                className="tnum text-[0.8125rem] text-subtle line-through"
              />
            ) : null}
          </p>
        </div>
        <Button asChild size="md" className="shrink-0">
          <a href={`#${targetId}`} tabIndex={visible ? undefined : -1}>
            Start a deal
          </a>
        </Button>
      </div>
    </div>
  );
}
