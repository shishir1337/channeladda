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
  exact,
  className,
}: {
  usd: number;
  compact?: boolean;
  /**
   * US dollars to the cent, whatever the header switcher says.
   *
   * For the moment somebody confirms money leaving. A converted, rounded
   * figure is right for browsing and wrong there: the finance desk was
   * asked to confirm a $20.50 payout as “$21”, in whatever currency they
   * last picked.
   */
  exact?: boolean;
  className?: string;
}) {
  const { format, currency } = useCurrency();
  if (exact) {
    return (
      <span className={cn("tnum", className)} data-currency="USD">
        {usd.toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </span>
    );
  }
  return (
    <span className={cn("tnum", className)} data-currency={currency.code}>
      {format(usd, { compact })}
    </span>
  );
}
