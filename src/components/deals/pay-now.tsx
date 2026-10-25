"use client";

import {
  CheckIcon,
  CreditCardIcon,
  LifeBuoyIcon,
  PlusIcon,
  WalletIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Card, TurnFlag } from "@/components/app/kit";
import { BusyLabel } from "@/components/deals/deal-timeline";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { balanceRoute } from "@/lib/pay-options";
import { siteMoment } from "@/lib/site-time";
import { supportHref } from "@/lib/support";
import { cn } from "@/lib/utils";
import { payFromBalance } from "@/server/actions/deals";
import { startPayment } from "@/server/actions/payments";
import { startTopUp } from "@/server/actions/wallet";

/** "$1,184.50", for the words on a button. */
function usd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

/**
 * A buyer's payment to Channel Adda: the opening one, and the only one.
 *
 * Deliberately says what the money is for before asking for it: on a Safest
 * deal it is the fee alone and the channel's price goes to the seller
 * directly later, and a buyer who does not know that will think the figure
 * is wrong. On Fastest it is everything, held until our agent has it.
 *
 * In the conversation it is a card of its own, the same shape as the
 * next-step card, because at this point in a deal paying is the only thing
 * that moves anything. On the deal page it is drawn `inline`, inside the
 * step it completes, which already names it.
 *
 * Paying from the balance asks once more, as every other press that moves
 * money does: one tap used to take it. With online checkout switched off,
 * asking Channel Adda is the way to pay, so it is the button rather than a
 * crypto checkout that can only refuse.
 */
export function PayNow({
  orderId,
  reference,
  amountUsd,
  priceUsd,
  mode,
  availableUsd,
  payBy = null,
  fromOffer = false,
  checkoutOn = true,
  asset = "channel",
  inline = false,
}: {
  orderId: string;
  /** The deal's reference, for the message to Channel Adda. */
  reference?: string;
  /** Cents due now: the whole amount on Fastest, the fee on Safest. */
  amountUsd: number;
  /** Cents. Named on a Safest opening payment, as what follows it. */
  priceUsd: number;
  mode: "SAFEST" | "FASTEST";
  /** The buyer's spendable balance, so the cheaper route is offered first. */
  availableUsd: number;
  /** When the payment window closes (ISO): the deal lapses then. */
  payBy?: string | null;
  /**
   * Opened from an offer the seller accepted: the listing is held for this
   * buyer until `payBy`, not open to anybody who pays first.
   */
  fromOffer?: boolean;
  /** Cryptomus is configured. Without it neither crypto nor a top-up works. */
  checkoutOn?: boolean;
  /** What is being sold: "channel", "account", "Page", "website". */
  asset?: string;
  /** Inside the deal page's step list: no card and no heading of its own. */
  inline?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [armed, setArmed] = useState(false);
  const confirmRef = useRef<HTMLDivElement>(null);
  // Which button started the payment, so only that one shows it working.
  const [via, setVia] = useState<"balance" | "crypto" | "top-up" | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (armed) {
      confirmRef.current?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    }
  }, [armed]);

  const route = balanceRoute(availableUsd, amountUsd);
  const canUseBalance = route.kind === "balance";
  const due = usd(amountUsd);
  const deadline = payBy ? siteMoment(new Date(payBy)) : null;
  const askHref = `${supportHref("A live order")}&message=${encodeURIComponent(
    `Please send me payment details for deal ${reference ?? ""} (${due}).`,
  )}`;

  const payFromWallet = () => {
    setError(null);
    setManual(false);
    setVia("balance");
    startTransition(async () => {
      const result = await payFromBalance(orderId);
      setArmed(false);
      if (!result.ok) {
        setError(result.error);
        // The deal may have closed under this page — another buyer paid
        // first. Redraw it, so the pay buttons do not stay to be pressed.
        if (result.closed) router.refresh();
        return;
      }
      router.refresh();
    });
  };

  const body = (
    <>
      <p className="max-w-[62ch] text-[0.8125rem] leading-relaxed text-muted">
        {/* One line each: what this payment is, and what happens to it. */}
        {mode === "SAFEST" ? (
          <>
            Our fee only. You pay the seller{" "}
            <Price usd={priceUsd / 100} className="font-medium text-fg" />{" "}
            later, once our agent has the {asset}.
          </>
        ) : (
          `The price and our fee. You pay Channel Adda, and we hold it until our agent has the ${asset}.`
        )}
      </p>

      <div className="mt-4 flex items-baseline justify-between gap-3 border-y border-line py-3">
        <span className="text-[0.8125rem] text-muted">You pay now</span>
        <Price
          usd={amountUsd / 100}
          className="text-xl leading-7 font-semibold tracking-[-0.015em] text-fg"
        />
      </div>

      {/* An accepted offer holds the listing for this buyer; anything else
          is the first buyer to pay. Either way, by when. */}
      <p className="mt-3 max-w-[62ch] text-[0.8125rem] leading-relaxed font-medium text-primary-text tabular-nums">
        {fromOffer
          ? deadline
            ? `This listing is held for you until ${deadline}. Pay by then, or it goes back on sale.`
            : "This listing is held for you until the payment window ends."
          : deadline
            ? `Pay by ${deadline}. Until you do, another buyer can still buy it.`
            : "Pay soon: until you do, another buyer can still buy it."}
      </p>

      {route.kind === "top-up" ? (
        <p className="mt-3 max-w-[62ch] text-[0.8125rem] leading-relaxed text-muted">
          You have{" "}
          <Price usd={availableUsd / 100} className="font-medium text-fg" /> in
          your balance.{" "}
          {checkoutOn ? (
            <>
              Add{" "}
              <Price
                usd={route.topUpUsd / 100}
                className="font-medium text-fg"
              />{" "}
              to pay from it.
            </>
          ) : (
            <>
              Paying online is not switched on yet, so ask Channel Adda how to
              pay. We reply here in the app, and once your money reaches us it
              is recorded against this deal.
            </>
          )}
        </p>
      ) : null}

      {armed ? (
        <div
          ref={confirmRef}
          role="alertdialog"
          aria-label={`Pay ${due} from your balance?`}
          className="mt-4 max-w-[62ch] scroll-mb-24 rounded-lg border border-primary/40 bg-primary-soft/60 p-3"
        >
          <p className="text-[0.8125rem] leading-relaxed text-fg">
            Pay {due} from your balance? It goes to Channel Adda now, and this
            deal starts.
          </p>
          <div className="mt-3 flex flex-col gap-2 @sm:flex-row @sm:flex-wrap">
            <Button
              type="button"
              size="md"
              disabled={pending}
              onClick={payFromWallet}
            >
              <BusyLabel busy={pending && via === "balance"} busyText="Paying…">
                <CheckIcon aria-hidden="true" />
                Yes — pay {due}
              </BusyLabel>
            </Button>
            <Button
              type="button"
              size="md"
              variant="ghost"
              disabled={pending}
              onClick={() => setArmed(false)}
            >
              Not yet
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2 @sm:flex-row @sm:flex-wrap">
          {canUseBalance ? (
            <Button
              type="button"
              size="md"
              disabled={pending}
              onClick={() => {
                setError(null);
                setArmed(true);
              }}
            >
              <WalletIcon aria-hidden="true" />
              Pay from your balance
            </Button>
          ) : null}

          {checkoutOn ? (
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
                    // Both read as information, not an error: "pay by
                    // hand", and "Cryptomus already has your payment".
                    setManual(Boolean(result.manual || result.notice));
                    if (result.closed) router.refresh();
                    return;
                  }
                  // Cryptomus hosts the payment page; a full navigation
                  // rather than a router push, because it is another origin.
                  window.location.href = result.url;
                });
              }}
            >
              <BusyLabel busy={pending && via === "crypto"} busyText="Opening…">
                <CreditCardIcon aria-hidden="true" />
                Pay with crypto
              </BusyLabel>
            </Button>
          ) : (
            <Button
              asChild
              size="md"
              variant={canUseBalance ? "secondary" : "primary"}
            >
              <Link href={askHref}>
                <LifeBuoyIcon aria-hidden="true" />
                {canUseBalance
                  ? "Ask Channel Adda how to pay"
                  : "Ask Channel Adda to add funds"}
              </Link>
            </Button>
          )}

          {route.kind === "top-up" && checkoutOn ? (
            <Button
              type="button"
              size="md"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                setError(null);
                setManual(false);
                setVia("top-up");
                startTransition(async () => {
                  // Back to this deal once paid, to pay it from the balance.
                  const result = await startTopUp(
                    route.topUpUsd / 100,
                    `/dashboard/deals/${orderId}`,
                  );
                  if (!result.ok) {
                    setError(result.error);
                    setManual(true);
                    return;
                  }
                  if (result.url) window.location.href = result.url;
                });
              }}
            >
              <BusyLabel busy={pending && via === "top-up"} busyText="Opening…">
                <PlusIcon aria-hidden="true" />
                Top up the difference
              </BusyLabel>
            </Button>
          ) : null}
        </div>
      )}

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
          {mode === "SAFEST" ? "Pay our fee to start" : "Pay to start"}
        </h2>
        <div className="mt-1.5">{body}</div>
      </section>
    </Card>
  );
}
