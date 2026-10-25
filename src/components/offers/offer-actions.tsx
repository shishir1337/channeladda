"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { inputClass, labelClass, textareaClass } from "@/components/app/kit";
import { FormNotice } from "@/components/auth/fields";
import { BusyLabel } from "@/components/messages/chat-parts";
import { Button } from "@/components/ui/button";
import type { OfferStatus } from "@/generated/prisma/enums";
import { toCents } from "@/lib/listing-form";
import {
  amountProblem,
  OFFER_PROBLEM_TEXT,
  parseAmount,
} from "@/lib/offer-rules";
import { cn } from "@/lib/utils";
import {
  acceptOffer,
  counterOffer,
  declineOffer,
  withdrawOffer,
} from "@/server/actions/offers";

function usd(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * The buttons that answer an offer, wherever the offer is shown.
 *
 * One set, used by the Offers page card and the card in a conversation, so
 * the two cannot drift apart in what they offer. Accept, Counter and Decline
 * for the person whose move it is; Withdraw for the person who made it while
 * it waits on the other side. The server checks every one of them again, so
 * a card that is a few seconds stale gets a plain refusal, not a mistake.
 *
 * It draws no box of its own: it always sits inside a card that already has
 * one, and a box in a box is just another edge to read past.
 *
 * Decline and Withdraw ask once before they act: each closes the offer for
 * good, and QA found both went through on a single tap.
 */
export function OfferActions({
  offer,
  viewingAs,
  askingPrice,
}: {
  offer: {
    id: string;
    /** Dollars. */
    amount: number;
    awaiting: "buyer" | "seller" | null;
    bySeller: boolean;
    effectiveStatus: OfferStatus;
  };
  viewingAs: "buyer" | "seller";
  /** Dollars, when the caller knows it: lets the counter box say more. */
  askingPrice?: number;
}) {
  const router = useRouter();
  const [countering, setCountering] = useState(false);
  const [counterAmount, setCounterAmount] = useState("");
  const [counterMessage, setCounterMessage] = useState("");
  const [confirming, setConfirming] = useState<"decline" | "withdraw" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const open = offer.effectiveStatus === "OPEN";
  const yourTurn = open && offer.awaiting === viewingAs;
  // Whoever made an open offer is the side it is not waiting on.
  const yours = open && offer.awaiting !== null && !yourTurn;

  // Said while typing, not found out by pressing: a counter sits between the
  // two numbers on the table. The server checks it again either way.
  const counterValue = parseAmount(counterAmount);
  const counterEntered = Number.isFinite(counterValue) && counterValue > 0;
  const counterUnreadable = counterAmount.trim() !== "" && !counterEntered;
  const counterProblem = counterEntered
    ? amountProblem({
        amountCents: toCents(counterValue),
        askingCents: askingPrice === undefined ? null : toCents(askingPrice),
        answering: {
          amountCents: toCents(offer.amount),
          bySeller: offer.bySeller,
        },
      })
    : null;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      setConfirming(null);
      if (!result.ok) {
        setError(result.error ?? "That did not work. Try again.");
        // Whatever made it fail — answered elsewhere, lapsed — is worth
        // showing now rather than on the next poll.
        router.refresh();
        return;
      }
      setCountering(false);
      router.refresh();
    });
  }

  if (!yourTurn && !yours) return null;

  if (confirming) {
    const declining = confirming === "decline";
    return (
      <div
        role="alertdialog"
        aria-labelledby={`${offer.id}-confirm-title`}
        aria-describedby={`${offer.id}-confirm-body`}
        className="rounded-lg border border-danger/25 bg-danger-soft/60 p-3.5"
      >
        <p
          id={`${offer.id}-confirm-title`}
          className="text-sm leading-5 font-semibold text-fg"
        >
          {declining
            ? `Decline ${usd(offer.amount)}?`
            : `Withdraw your ${offer.bySeller ? "price" : "offer"} of ${usd(offer.amount)}?`}
        </p>
        <p
          id={`${offer.id}-confirm-body`}
          className="mt-1 text-[0.8125rem] leading-relaxed text-muted"
        >
          {declining
            ? "The offer closes and they are told. To ask for a different price instead, counter."
            : "It closes for good and the other side is told. You can make a new one afterwards."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={pending}
            onClick={() =>
              run(() =>
                declining ? declineOffer(offer.id) : withdrawOffer(offer.id),
              )
            }
          >
            <BusyLabel
              busy={pending}
              idle={declining ? "Yes, decline" : "Yes, withdraw"}
              working="Working…"
            />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => setConfirming(null)}
          >
            Keep it open
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {error ? <FormNotice>{error}</FormNotice> : null}

      {yourTurn && !countering ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => run(() => acceptOffer(offer.id))}
          >
            <BusyLabel
              busy={pending}
              idle={`Accept ${usd(offer.amount)}`}
              working="Working…"
            />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => {
              // Empty, not the offer being answered: a counter equal to it
              // is the one figure that is never the answer.
              setCounterAmount("");
              setCountering(true);
            }}
          >
            Counter
          </Button>
          <Button
            type="button"
            variant="danger-outline"
            size="sm"
            disabled={pending}
            onClick={() => {
              setError(null);
              setConfirming("decline");
            }}
          >
            Decline
          </Button>
        </div>
      ) : null}

      {countering ? (
        <div className="flex flex-col gap-3">
          <label className={labelClass}>
            Counter with (USD)
            <span className="relative mt-1.5 block max-w-48">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-subtle"
              >
                $
              </span>
              <input
                // biome-ignore lint/a11y/noAutofocus: it appears because "Counter" was just pressed, and it is empty — the cursor belongs in it.
                autoFocus
                inputMode="decimal"
                placeholder="Your price"
                value={counterAmount}
                onChange={(e) => setCounterAmount(e.target.value)}
                aria-invalid={Boolean(counterProblem) || counterUnreadable}
                aria-describedby={`${offer.id}-counter-hint`}
                className={cn(inputClass, "pl-7 font-normal tabular-nums")}
              />
            </span>
          </label>
          <p
            id={`${offer.id}-counter-hint`}
            className={cn(
              "-mt-1.5 text-[0.8125rem] leading-relaxed",
              counterProblem || counterUnreadable
                ? "text-danger"
                : "text-subtle",
            )}
          >
            {counterProblem
              ? OFFER_PROBLEM_TEXT[counterProblem]
              : counterUnreadable
                ? "Enter an amount in dollars, like 2,100."
                : offer.bySeller
                  ? `Less than ${usd(offer.amount)}.`
                  : askingPrice === undefined
                    ? `More than ${usd(offer.amount)}.`
                    : `More than ${usd(offer.amount)}, up to ${usd(askingPrice)}.`}
          </p>
          <label className={labelClass}>
            Message (optional)
            <textarea
              rows={2}
              value={counterMessage}
              onChange={(e) => setCounterMessage(e.target.value)}
              className={cn(textareaClass, "mt-1.5 min-h-16 font-normal")}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={pending || !counterEntered || Boolean(counterProblem)}
              onClick={() =>
                run(() => counterOffer(offer.id, counterValue, counterMessage))
              }
            >
              <BusyLabel
                busy={pending}
                idle="Send counter"
                working="Sending…"
              />
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

      {yours ? (
        <Button
          type="button"
          variant="danger-outline"
          size="sm"
          disabled={pending}
          onClick={() => {
            setError(null);
            setConfirming("withdraw");
          }}
        >
          {offer.bySeller ? "Withdraw price" : "Withdraw offer"}
        </Button>
      ) : null}
    </div>
  );
}
