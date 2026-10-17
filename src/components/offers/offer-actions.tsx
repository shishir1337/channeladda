"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormNotice } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import type { OfferStatus } from "@/generated/prisma/enums";
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
        <div className="flex flex-wrap gap-2.5">
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
        <div className="rounded-xl border border-line bg-surface-2 p-4">
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
