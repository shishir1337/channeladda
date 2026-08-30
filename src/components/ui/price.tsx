"use client";

import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";

/**
 * Renders a USD amount in whichever currency the header switcher is set to.
 * Every price on the page goes through this so the switch is consistent.
 */
export function Price({
  usd,
  compact,
  className,
}: {
  usd: number;
  compact?: boolean;
  className?: string;
}) {
  const { format, currency } = useCurrency();
  return (
    <span className={cn("tnum", className)} data-currency={currency.code}>
      {format(usd, { compact })}
    </span>
  );
}
