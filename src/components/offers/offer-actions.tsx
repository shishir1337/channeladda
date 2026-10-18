"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { inputClass, labelClass, textareaClass } from "@/components/app/kit";
import { FormNotice } from "@/components/auth/fields";
import { BusyLabel } from "@/components/messages/chat-parts";
import { Button } from "@/components/ui/button";
import type { OfferStatus } from "@/generated/prisma/enums";
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
    maximumFractionDigits: 0,
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
 */
export function OfferActions({
  offer,
  viewingAs,
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
}) {
  const router = useRouter();
  const [countering, setCountering] = useState(false);
  const [counterAmount, setCounterAmount] = useState("");
  const [counterMessage, setCounterMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const open = offer.effectiveStatus === "OPEN";
  const yourTurn = open && offer.awaiting === viewingAs;
  // Whoever made an open offer is the side it is not waiting on.
  const yours = open && offer.awaiting !== null && !yourTurn;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
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
                inputMode="decimal"
                value={counterAmount}
                onChange={(e) => setCounterAmount(e.target.value)}
                className={cn(inputClass, "pl-7 font-normal tabular-nums")}
              />
            </span>
          </label>
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
              disabled={pending || !counterAmount.trim()}
              onClick={() =>
                run(() =>
                  counterOffer(offer.id, Number(counterAmount), counterMessage),
                )
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
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => run(() => withdrawOffer(offer.id))}
        >
          {offer.bySeller ? "Withdraw price" : "Withdraw offer"}
        </Button>
      ) : null}
    </div>
  );
}
