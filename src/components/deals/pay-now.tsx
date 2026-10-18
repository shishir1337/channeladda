"use client";

import { CreditCardIcon, WalletIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Card, TurnFlag } from "@/components/app/kit";
import { BusyLabel } from "@/components/deals/deal-timeline";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { cn } from "@/lib/utils";
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
 * In the conversation it is a card of its own, the same shape as the
 * next-step card, because at this point in a deal paying is the only thing
 * that moves anything. On the deal page it is drawn `inline`, inside the
 * step it completes, which already names it.
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
  inline = false,
}: {
  orderId: string;
  totalUsd: number;
  priceUsd: number;
  mode: "SAFEST" | "FASTEST";
  /** The buyer's spendable balance, so the cheaper route is offered first. */
  availableUsd: number;
  /** Inside the deal page's step list: no card and no heading of its own. */
  inline?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  // Which button started the payment, so only that one shows it working.
  const [via, setVia] = useState<"balance" | "crypto" | null>(null);
  const [pending, startTransition] = useTransition();

  const canUseBalance = availableUsd >= totalUsd;

  const body = (
    <>
      <p className="max-w-[62ch] text-[0.8125rem] leading-relaxed text-muted">
        {mode === "SAFEST" ? (
          <>
            This is our fee only. Once our agent owns the channel you will pay
            the seller{" "}
            <Price usd={priceUsd / 100} className="font-medium text-fg" />{" "}
            directly, and we will tell you when.
          </>
        ) : (
          <>
            The channel price and our fee together. We hold all of it until you
            confirm you have access.
          </>
        )}
      </p>

      <div className="mt-4 flex items-baseline justify-between gap-3 border-y border-line py-3">
        <span className="text-[0.8125rem] text-muted">You pay now</span>
        <Price
          usd={totalUsd / 100}
          className="text-xl leading-7 font-semibold tracking-[-0.015em] text-fg"
        />
      </div>

      <div className="mt-4 flex flex-col gap-2 @sm:flex-row @sm:flex-wrap">
        {canUseBalance ? (
          <Button
            type="button"
            size="md"
            disabled={pending}
            onClick={() => {
              setError(null);
              setManual(false);
              setVia("balance");
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
            <BusyLabel busy={pending && via === "balance"} busyText="Paying…">
              <WalletIcon aria-hidden="true" />
              Pay from your balance
            </BusyLabel>
          </Button>
        ) : null}

        <Button
          type="button"
          size="md"
          variant={canUseBalance ? "secondary" : "primary"}
          disabled={pending}
          onClick={() => {
            setError(null);
            setManual(false);
            setVia("crypto");
            startTransition(async () => {
              const result = await startPayment(orderId);
              if (!result.ok) {
                setError(result.error);
                // Both read as information, not an error: "pay by hand",
                // and "Cryptomus already has your payment".
                setManual(Boolean(result.manual || result.notice));
                return;
              }
              // Cryptomus hosts the payment page; a full navigation rather
              // than a router push, because it is another origin.
              window.location.href = result.url;
            });
          }}
        >
          <BusyLabel busy={pending && via === "crypto"} busyText="Opening…">
            <CreditCardIcon aria-hidden="true" />
            Pay with crypto
          </BusyLabel>
        </Button>
      </div>

      {error ? (
        <p
          role={manual ? "status" : "alert"}
          className={cn(
            "mt-3 max-w-[62ch] text-[0.8125rem] leading-relaxed",
            manual ? "text-muted" : "font-medium text-danger",
          )}
        >
          {error}
        </p>
      ) : null}
    </>
  );

  if (inline) return <div className="@container">{body}</div>;

  return (
    <Card className="@container">
      <section aria-labelledby="pay-now-heading" className="p-4 sm:p-5">
        <TurnFlag mine />
        <h2
          id="pay-now-heading"
          className="mt-2.5 text-[0.9375rem] leading-6 font-semibold text-fg"
        >
          {mode === "SAFEST" ? "Pay the admin fee to begin" : "Pay to begin"}
        </h2>
        <div className="mt-1.5">{body}</div>
      </section>
    </Card>
  );
}
