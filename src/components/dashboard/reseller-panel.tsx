"use client";

import { CheckCircle2Icon, GemIcon, Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { Card, CardBody, CardHeader } from "@/components/app/kit";
import { pointsLabel, ResellerBadge } from "@/components/app/reseller-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  buyResellerFromBalance,
  startResellerCheckout,
} from "@/server/actions/reseller";

/**
 * The Reseller badge on the wallet page: what it does, whether it is on, and
 * buying 30 days.
 *
 * From the balance when it covers the price, with crypto otherwise — the
 * crypto payment lands in the balance and is spent on the badge at once, so
 * it is the same purchase either way. Each press carries one nonce, made
 * when the panel was drawn and renewed after a purchase, so a double click
 * buys one pass.
 */

function newNonce() {
  return crypto.randomUUID().replaceAll("-", "");
}

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function Busy({
  pending,
  idle,
  busy,
}: {
  pending: boolean;
  idle: ReactNode;
  busy: ReactNode;
}) {
  // Both labels in one cell, so the button keeps its width while it works.
  return (
    <span className="grid">
      <span
        className={cn(
          "col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5",
          pending && "invisible",
        )}
      >
        {idle}
      </span>
      <span
        className={cn(
          "col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5",
          !pending && "invisible",
        )}
      >
        <Loader2Icon aria-hidden="true" className="animate-spin" />
        {busy}
      </span>
    </span>
  );
}

function Benefit({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <CheckCircle2Icon
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-primary"
      />
      <span>{children}</span>
    </li>
  );
}

export function ResellerPanel({
  priceUsd,
  discountBp,
  multiplier,
  active,
  endsAt,
  points,
  availableUsd,
  sellerFeeBp,
}: {
  /** Cents for 30 days. */
  priceUsd: number;
  discountBp: number;
  multiplier: number;
  active: boolean;
  /** ISO date the badge ends, while active. */
  endsAt: string | null;
  /** Rating points as they stand, with the badge applied while active. */
  points: number;
  availableUsd: number;
  /** The seller fee: with none, the discount only ever applies to buying. */
  sellerFeeBp: number;
}) {
  const router = useRouter();
  const [nonce, setNonce] = useState(newNonce);
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(
    null,
  );
  const [via, setVia] = useState<"balance" | "crypto" | null>(null);
  const [pending, startTransition] = useTransition();
  const price = dollars(priceUsd);
  const covered = availableUsd >= priceUsd;
  const until = endsAt
    ? new Date(endsAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <Card className="flex flex-col">
      <CardHeader
        as="h2"
        icon={GemIcon}
        title="Reseller badge"
        info="Bought 30 days at a time. Paying while it is active adds 30 days on to the end, so nothing is lost by paying early. A deal keeps the fee it was opened at."
      />
      <CardBody className="flex flex-1 flex-col">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg">
          {active ? (
            <>
              <ResellerBadge />
              <span>
                Active until <strong className="font-semibold">{until}</strong>
              </span>
            </>
          ) : (
            <span className="text-muted">Not active</span>
          )}
          <span aria-hidden="true" className="text-subtle">
            ·
          </span>
          <span className="tnum">
            Your rating:{" "}
            <strong className="font-semibold">{pointsLabel(points)}</strong>
          </span>
        </p>

        <ul className="mt-4 flex flex-col gap-2 text-[0.8125rem] leading-relaxed text-muted">
          <Benefit>
            The badge beside your name, wherever buyers and sellers see it
          </Benefit>
          <Benefit>
            Your rating points count {multiplier}x while it lasts
          </Benefit>
          <Benefit>
            {discountBp / 100}% off every Channel Adda fee you pay
            {sellerFeeBp > 0 ? ", buying or selling" : " when you buy"}
          </Benefit>
        </ul>

        <div className="mt-auto pt-5">
          <p className="text-sm">
            <strong className="text-base font-semibold text-fg tabular-nums">
              {price}
            </strong>{" "}
            <span className="text-muted">for 30 days</span>
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              size="md"
              className="w-full sm:w-auto"
              disabled={pending || !covered}
              onClick={() => {
                setMessage(null);
                setVia("balance");
                startTransition(async () => {
                  const result = await buyResellerFromBalance(nonce);
                  if (!result.ok) {
                    setMessage({ text: result.error, bad: true });
                    return;
                  }
                  setNonce(newNonce());
                  setMessage({ text: result.message, bad: false });
                  router.refresh();
                });
              }}
            >
              <Busy
                pending={pending && via === "balance"}
                idle={
                  active
                    ? `Add 30 days for ${price}`
                    : `Pay ${price} from balance`
                }
                busy="Paying…"
              />
            </Button>
            <Button
              type="button"
              size="md"
              variant="secondary"
              className="w-full sm:w-auto"
              disabled={pending}
              onClick={() => {
                setMessage(null);
                setVia("crypto");
                startTransition(async () => {
                  const result = await startResellerCheckout();
                  if (!result.ok) {
                    setMessage({ text: result.error, bad: true });
                    return;
                  }
                  if (result.url) window.location.href = result.url;
                });
              }}
            >
              <Busy
                pending={pending && via === "crypto"}
                idle="Pay with crypto"
                busy="Opening the payment page…"
              />
            </Button>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-subtle">
            {!covered
              ? `Your available balance is ${dollars(availableUsd)}. Pay with crypto, or add funds first.`
              : active
                ? "Paying again adds 30 days on to the end."
                : "From your balance it is active at once."}
          </p>
          {message ? (
            <p
              role={message.bad ? "alert" : "status"}
              className={cn(
                "mt-3 rounded-lg border px-3.5 py-2.5 text-[0.8125rem] leading-relaxed text-fg",
                message.bad
                  ? "border-danger/25 bg-danger-soft/70"
                  : "border-verified/25 bg-verified-soft/70",
              )}
            >
              {message.text}
            </p>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}
