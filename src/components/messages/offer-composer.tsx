"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { FormNotice } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { makeOffer, proposePrice } from "@/server/actions/offers";

export type OfferComposerConfig = {
  /** A buyer makes an offer; a seller puts a price. */
  mode: "offer" | "price";
  conversationId: string;
  listingId: string;
  /** Dollars. */
  askingPrice: number;
  expiryHours: number;
};

function usd(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/**
 * Putting a number on the table from the message box.
 *
 * The same offer the listing page makes, through the same action, so the
 * rules are the server's: at least half the asking price, one open offer at
 * a time, and for a seller, below the asking price. The hints here only save
 * a round trip; they decide nothing.
 */
export function OfferComposerForm({
  config,
  onDone,
}: {
  config: OfferComposerConfig;
  onDone: () => void;
}) {
  const router = useRouter();
  const amountId = useId();
  const noteId = useId();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const seller = config.mode === "price";
  const parsed = Number(amount);
  const entered = Number.isFinite(parsed) && parsed > 0;
  const tooLow = entered && parsed < config.askingPrice / 2;
  const tooHigh = seller && entered && parsed >= config.askingPrice;

  return (
    <form
      className="rounded-card border border-line bg-surface-2 p-3.5 sm:p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = seller
            ? await proposePrice(config.conversationId, parsed, note)
            : await makeOffer(config.listingId, parsed, note);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setAmount("");
          setNote("");
          onDone();
          router.refresh();
        });
      }}
    >
      {error ? <FormNotice>{error}</FormNotice> : null}

      <label htmlFor={amountId} className="block text-sm font-medium text-fg">
        {seller ? "Your price (USD)" : "Your offer (USD)"}
      </label>
      <p className="mt-1 text-xs text-subtle">
        Asking price is {usd(config.askingPrice)}.{" "}
        {seller
          ? "The buyer can accept it, counter, or turn it down."
          : "The seller can accept it, counter, or turn it down."}{" "}
        It lapses after {config.expiryHours} hours.
      </p>
      <input
        id={amountId}
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder={String(Math.round(config.askingPrice * 0.9))}
        className="mt-2 h-11 w-full max-w-xs rounded-xl border border-line bg-surface px-3.5 text-base text-fg placeholder:text-subtle focus:border-primary/60 focus:outline-none sm:text-[0.9375rem]"
        required
      />
      {tooLow ? (
        <p className="mt-2 text-sm text-danger">
          That is less than half the asking price and will be refused.
        </p>
      ) : null}
      {tooHigh ? (
        <p className="mt-2 text-sm text-danger">
          At the asking price the buyer can simply buy. Offer less.
        </p>
      ) : null}

      <label
        htmlFor={noteId}
        className="mt-3 block text-sm font-medium text-fg"
      >
        Note (optional)
      </label>
      <textarea
        id={noteId}
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="mt-2 w-full rounded-xl border border-line bg-surface p-3 text-base text-fg focus:border-primary/60 focus:outline-none sm:text-[0.9375rem]"
      />

      <div className="mt-3 flex flex-wrap gap-2.5">
        <Button
          type="submit"
          size="sm"
          disabled={pending || !entered || tooLow || tooHigh}
        >
          {pending ? "Sending…" : seller ? "Send price" : "Send offer"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
