"use client";

import { CreditCardIcon, LoaderCircleIcon, WalletIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { startPayment } from "@/server/actions/payments";
import { payDealFromWallet } from "@/server/actions/wallet";

/**
 * The buyer's one payment.
 *
 * Deliberately says what the money is for before asking for it: on a Safest
 * deal this is the fee alone and the channel's price follows later, directly
 * to the seller, and a buyer who does not know that will think the figure is
 * wrong.
 *
 * It is styled as the page's single action, the same card the next-step panel
 * uses, because at this point in a deal paying is the only thing that moves
 * anything.
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
  availableUsd,
}: {
  orderId: string;
  totalUsd: number;
  priceUsd: number;
  mode: "SAFEST" | "FASTEST";
  /** The buyer's spendable balance, so the cheaper route is offered first. */
  availableUsd: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [pending, startTransition] = useTransition();

  const canUseBalance = availableUsd >= totalUsd;

  return (
    <section
      aria-labelledby="pay-now-heading"
      className="rounded-panel border border-primary/40 bg-primary-soft p-5 sm:p-6"
    >
      <p className="flex flex-wrap items-center gap-2 font-mono text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
        <span
          aria-hidden="true"
          className="size-1.5 animate-pulse-dot rounded-full bg-primary"
        />
        <span className="text-primary-text">Your move</span>
      </p>

      <h2
        id="pay-now-heading"
        className="mt-2.5 font-display text-lg leading-snug font-bold text-fg sm:text-xl"
      >
        {mode === "SAFEST" ? "Pay the admin fee to begin" : "Pay to begin"}
      </h2>

      <p className="mt-2 max-w-[62ch] text-[0.9375rem] leading-relaxed text-muted">
        {mode === "SAFEST" ? (
          <>
            This is our fee only. Once our agent owns the channel you will pay
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

      <div className="mt-4 flex items-baseline gap-2.5 border-y border-primary/25 py-3.5">
        <span className="text-xs font-medium tracking-wide text-muted uppercase">
          You pay now
        </span>
        <Price
          usd={totalUsd / 100}
          className="ml-auto font-display text-2xl font-black text-fg sm:text-[1.75rem]"
        />
      </div>

      <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
        {canUseBalance ? (
          <Button
            type="button"
            size="lg"
            disabled={pending}
            onClick={() => {
              setError(null);
              setManual(false);
              startTransition(async () => {
                const result = await payDealFromWallet(orderId);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                router.refresh();
              });
            }}
          >
            {pending ? (
              <LoaderCircleIcon
                aria-hidden="true"
                className="size-4 animate-spin"
              />
            ) : (
              <WalletIcon aria-hidden="true" className="size-4" />
            )}
            {pending ? "Paying…" : "Pay from your balance"}
          </Button>
        ) : null}

        <Button
          type="button"
          size="lg"
          variant={canUseBalance ? "secondary" : "primary"}
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
          {pending ? (
            <LoaderCircleIcon
              aria-hidden="true"
              className="size-4 animate-spin"
            />
          ) : (
            <CreditCardIcon aria-hidden="true" className="size-4" />
          )}
          {pending ? "Opening…" : "Pay with crypto"}
        </Button>
      </div>

      {error ? (
        <p
          role={manual ? "status" : "alert"}
          className={`mt-3.5 max-w-[62ch] text-sm leading-relaxed ${manual ? "text-muted" : "font-medium text-danger"}`}
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
