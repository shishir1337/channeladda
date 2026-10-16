"use client";

import { CreditCardIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { startPayment } from "@/server/actions/payments";

/**
 * The buyer's one payment.
 *
 * Deliberately says what the money is for before asking for it: on a Safest
 * deal this is the fee alone and the channel's price follows later, directly
 * to the seller, and a buyer who does not know that will think the figure is
 * wrong.
 *
 * When checkout is not configured this does not disappear — it explains that
 * Channel Adda will send details and confirm by hand, which is the fallback
 * the finance desk already works.
 */
export function PayNow({
  orderId,
  totalUsd,
  priceUsd,
  mode,
}: {
  orderId: string;
  totalUsd: number;
  priceUsd: number;
  mode: "SAFEST" | "FASTEST";
}) {
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-6 rounded-panel border border-primary/30 bg-primary-soft p-5">
      <p className="text-sm font-semibold text-fg">
        {mode === "SAFEST" ? "Pay the admin fee to begin" : "Pay to begin"}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-muted">
        {mode === "SAFEST" ? (
          <>
            This is our fee only. Once our agent has the channel you will pay
            the seller <Price usd={priceUsd / 100} className="text-fg" />{" "}
            directly, and we will tell you when.
          </>
        ) : (
          <>
            The channel price and our fee together. We hold all of it until you
            confirm you have access.
          </>
        )}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Price usd={totalUsd / 100} className="text-2xl font-semibold" />
        <Button
          type="button"
          size="md"
          disabled={pending}
          onClick={() => {
            setError(null);
            setManual(false);
            startTransition(async () => {
              const result = await startPayment(orderId);
              if (!result.ok) {
                setError(result.error);
                setManual(Boolean(result.manual));
                return;
              }
              // Cryptomus hosts the payment page; a full navigation rather
              // than a router push, because it is another origin.
              window.location.href = result.url;
            });
          }}
        >
          <CreditCardIcon aria-hidden="true" className="size-4" />
          {pending ? "Opening…" : "Pay with crypto"}
        </Button>
      </div>

      {error ? (
        <p
          role={manual ? "status" : "alert"}
          className={`mt-3 text-xs leading-relaxed ${manual ? "text-muted" : "text-danger"}`}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
