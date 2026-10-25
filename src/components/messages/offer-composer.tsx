"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { InfoTip } from "@/components/app/info-tip";
import {
  hintClass,
  inputClass,
  labelClass,
  textareaClass,
} from "@/components/app/kit";
import { FormNotice } from "@/components/auth/fields";
import { BusyLabel } from "@/components/messages/chat-parts";
import { Button } from "@/components/ui/button";
import { toCents } from "@/lib/listing-form";
import {
  amountProblem,
  OFFER_PROBLEM_TEXT,
  parseAmount,
} from "@/lib/offer-rules";
import { cn } from "@/lib/utils";
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
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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
  // "2,100" and "$150" are amounts too, and a refused one says why.
  const parsed = parseAmount(amount);
  const entered = Number.isFinite(parsed) && parsed > 0;
  const unreadable = amount.trim() !== "" && !entered;
  const problem = entered
    ? amountProblem({
        amountCents: toCents(parsed),
        askingCents: toCents(config.askingPrice),
      })
    : null;
  // A seller's own price has the buyer's rule's words wrong: "start a deal".
  const hint =
    problem === "at-asking" && seller
      ? "At the asking price the buyer can simply buy. Offer less."
      : problem
        ? OFFER_PROBLEM_TEXT[problem]
        : unreadable
          ? "Enter an amount in dollars, like 2,100."
          : null;

  return (
    <form
      className="mb-2 rounded-card border border-line bg-surface p-4 shadow-xs"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = seller
            ? await proposePrice(
                config.conversationId,
                config.listingId,
                parsed,
                note,
              )
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

      <div className="flex items-center gap-1.5">
        <label htmlFor={amountId} className={labelClass}>
          {seller ? "Your price (USD)" : "Your offer (USD)"}
        </label>
        <InfoTip label="What happens to it">
          {seller
            ? "The buyer can accept it, counter, or turn it down."
            : "The seller can accept it, counter, or turn it down."}
        </InfoTip>
      </div>
      {/* The two figures that stop a mistake stay in sight: what is being
          asked, and when an unanswered number lapses. */}
      <p className={hintClass}>
        Asking price is{" "}
        <span className="tabular-nums">{usd(config.askingPrice)}</span>. It
        lapses after {config.expiryHours} hours.
      </p>
      <div className="relative mt-2 max-w-48">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-subtle"
        >
          $
        </span>
        <input
          id={amountId}
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={String(Math.round(config.askingPrice * 0.9))}
          aria-invalid={Boolean(hint)}
          aria-describedby={hint ? `${amountId}-hint` : undefined}
          className={cn(inputClass, "pl-7 tabular-nums")}
          required
        />
      </div>
      {hint ? (
        <p
          id={`${amountId}-hint`}
          className="mt-1.5 text-[0.8125rem] text-danger"
        >
          {hint}
        </p>
      ) : null}

      <label htmlFor={noteId} className={cn(labelClass, "mt-3.5")}>
        Note (optional)
      </label>
      <textarea
        id={noteId}
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className={cn(textareaClass, "mt-1.5 min-h-16")}
      />

      <div className="mt-3.5 flex flex-wrap gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={pending || !entered || Boolean(hint)}
        >
          <BusyLabel
            busy={pending}
            idle={seller ? "Send price" : "Send offer"}
            working="Sending…"
          />
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
