"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormNotice } from "@/components/auth/fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OfferStatus } from "@/generated/prisma/enums";
import {
  acceptOffer,
  counterOffer,
  declineOffer,
  withdrawOffer,
} from "@/server/actions/offers";

export type OfferCardData = {
  id: string;
  listingSlug: string;
  listingTitle: string;
  listingHandle: string;
  listingPrice: number;
  amount: number;
  effectiveStatus: OfferStatus;
  bySeller: boolean;
  message: string | null;
  expiresAt: string;
  createdAt: string;
  buyerName: string;
  sellerName: string;
  awaiting: "buyer" | "seller" | null;
};

const STATUS: Record<
  OfferStatus,
  {
    label: string;
    variant: "neutral" | "verified" | "primary" | "danger" | "info";
  }
> = {
  OPEN: { label: "Open", variant: "primary" },
  ACCEPTED: { label: "Accepted", variant: "verified" },
  REJECTED: { label: "Declined", variant: "neutral" },
  COUNTERED: { label: "Countered", variant: "info" },
  EXPIRED: { label: "Expired", variant: "neutral" },
  WITHDRAWN: { label: "Withdrawn", variant: "neutral" },
};

function usd(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function timeLeft(expiresAt: string) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 24) return `${Math.floor(hours / 24)}d left`;
  if (hours >= 1) return `${hours}h left`;
  return `${Math.max(1, Math.round(ms / 60_000))}m left`;
}

/**
 * One offer, from whichever side is looking at it.
 *
 * `viewingAs` is what the viewer is on *this* listing. It decides the wording
 * and which buttons appear — but never what is allowed: the server works the
 * side out again from the listing before acting. Not called `role`, which
 * would read as the ARIA attribute on a component.
 */
export function OfferCard({
  offer,
  viewingAs,
}: {
  offer: OfferCardData;
  viewingAs: "buyer" | "seller";
}) {
  const router = useRouter();
  const [countering, setCountering] = useState(false);
  const [counterAmount, setCounterAmount] = useState("");
  const [counterMessage, setCounterMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const status = STATUS[offer.effectiveStatus];
  // Someone taking the asking price is not haggling, and a seller should be
  // able to see that at a glance rather than comparing two numbers.
  const atAskingPrice = offer.amount >= offer.listingPrice;
  const yourTurn = offer.awaiting === viewingAs;
  const theirName = viewingAs === "seller" ? offer.buyerName : offer.sellerName;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error ?? "That did not work. Try again.");
        return;
      }
      setCountering(false);
      router.refresh();
    });
  }

  return (
    <li className="bg-surface p-4 sm:p-5">
      {error ? <FormNotice>{error}</FormNotice> : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={status.variant} size="sm">
              {status.label}
            </Badge>
            {yourTurn ? (
              <span className="text-xs font-medium text-primary-text">
                waiting on you
              </span>
            ) : offer.awaiting ? (
              <span className="text-xs text-subtle">
                waiting on {theirName.split(/\s+/)[0]}
              </span>
            ) : null}
            {offer.effectiveStatus === "OPEN" ? (
              <span className="text-xs text-subtle tabular-nums">
                {timeLeft(offer.expiresAt)}
              </span>
            ) : null}
          </div>

          <Link
            href={`/listing/${offer.listingSlug}`}
            className="mt-1.5 block truncate font-medium text-fg underline-offset-4 hover:underline"
          >
            {offer.listingTitle || offer.listingHandle}
          </Link>
          <p className="truncate text-sm text-subtle">
            {viewingAs === "seller"
              ? `From ${offer.buyerName}`
              : `Listed by ${offer.sellerName}`}
            {" · asking "}
            {usd(offer.listingPrice)}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="font-display text-xl font-bold text-fg tabular-nums">
            {usd(offer.amount)}
          </p>
          <p
            className={
              atAskingPrice && !offer.bySeller
                ? "text-xs font-medium text-verified"
                : "text-xs text-subtle"
            }
          >
            {offer.bySeller
              ? "their counter"
              : atAskingPrice
                ? "full asking price"
                : "offered"}
          </p>
        </div>
      </div>

      {offer.message ? (
        <p className="mt-3 rounded-xl border border-line bg-surface-2 p-3 text-sm leading-relaxed text-muted">
          {offer.message}
        </p>
      ) : null}

      {yourTurn && !countering ? (
        <div className="mt-4 flex flex-wrap gap-2.5">
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => run(() => acceptOffer(offer.id))}
          >
            {pending ? "Working…" : `Accept ${usd(offer.amount)}`}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => {
              setCounterAmount(String(Math.round(offer.amount)));
              setCountering(true);
            }}
          >
            Counter
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => run(() => declineOffer(offer.id))}
          >
            Decline
          </Button>
        </div>
      ) : null}

      {countering ? (
        <div className="mt-4 rounded-xl border border-line bg-surface-2 p-4">
          <label className="block text-sm font-medium text-fg">
            Counter with (USD)
            <input
              inputMode="decimal"
              value={counterAmount}
              onChange={(e) => setCounterAmount(e.target.value)}
              className="mt-2 h-11 w-full max-w-xs rounded-xl border border-line bg-surface px-3.5 text-base text-fg focus:border-primary/60 focus:outline-none sm:text-[0.9375rem]"
            />
          </label>
          <label className="mt-3 block text-sm font-medium text-fg">
            Message (optional)
            <textarea
              rows={2}
              value={counterMessage}
              onChange={(e) => setCounterMessage(e.target.value)}
              className="mt-2 w-full rounded-xl border border-line bg-surface p-3 text-base text-fg focus:border-primary/60 focus:outline-none sm:text-[0.9375rem]"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2.5">
            <Button
              type="button"
              size="sm"
              disabled={pending || !counterAmount.trim()}
              onClick={() =>
                run(() =>
                  counterOffer(offer.id, Number(counterAmount), counterMessage),
                )
              }
            >
              {pending ? "Sending…" : "Send counter"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setCountering(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {viewingAs === "buyer" &&
      offer.effectiveStatus === "OPEN" &&
      offer.awaiting === "seller" ? (
        <div className="mt-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => run(() => withdrawOffer(offer.id))}
          >
            Withdraw offer
          </Button>
        </div>
      ) : null}

      {offer.effectiveStatus === "ACCEPTED" ? (
        <p className="mt-4 rounded-xl border border-verified/30 bg-verified-soft p-3 text-sm text-fg">
          {viewingAs === "buyer"
            ? "Accepted. The listing is held for you — checkout is the next thing being built."
            : "Accepted. The listing is reserved for this buyer and hidden from everyone else."}
        </p>
      ) : null}
    </li>
  );
}
