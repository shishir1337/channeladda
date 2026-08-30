"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { FormNotice } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import { useHydrated } from "@/lib/use-hydrated";
import { makeOffer } from "@/server/actions/offers";

function usd(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/**
 * Make an offer.
 *
 * Signed-out visitors see what this does and where to sign in, rather than a
 * form that will reject them after they have typed into it.
 */
export function OfferForm({
  listingId,
  listingSlug,
  askingPrice,
  expiryHours,
  isOwnListing,
}: {
  listingId: string;
  listingSlug: string;
  askingPrice: number;
  expiryHours: number;
  isOwnListing: boolean;
}) {
  const amountId = useId();
  const messageId = useId();
  const router = useRouter();
  const hydrated = useHydrated();
  const { data: session, isPending } = useSession();
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Must match the server's markup exactly on the first client render.
  if (!hydrated || isPending) {
    return <p className="text-sm text-subtle">Checking your account…</p>;
  }

  if (!session?.user) {
    return (
      <div className="rounded-xl border border-line bg-surface-2 p-4">
        <p className="text-sm leading-relaxed text-muted">
          Offers go through Channel Adda so the whole negotiation is on record
          if a dispute is ever raised. You need an account to send one.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button asChild size="md">
            <Link href={`/signin?next=/listing/${listingSlug}`}>Sign in</Link>
          </Button>
          <Button asChild variant="secondary" size="md">
            <Link href="/signup">Create an account</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (isOwnListing) {
    return (
      <p className="rounded-xl border border-line bg-surface-2 p-4 text-sm text-muted">
        This is your listing. Offers you receive appear in{" "}
        <Link
          href="/dashboard/offers"
          className="font-medium text-primary-text underline-offset-4 hover:underline"
        >
          your offers
        </Link>
        .
      </p>
    );
  }

  if (sent) {
    return (
      <div className="rounded-xl border border-verified/30 bg-verified-soft p-4">
        <p className="text-sm text-fg">{sent}</p>
        <Button asChild variant="secondary" size="md" className="mt-4">
          <Link href="/dashboard/offers">Track it in your offers</Link>
        </Button>
      </div>
    );
  }

  const parsed = Number(amount);
  const tooLow =
    Number.isFinite(parsed) && parsed > 0 && parsed < askingPrice / 2;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await makeOffer(listingId, Number(amount), message);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setSent(result.message);
          router.refresh();
        });
      }}
    >
      {error ? <FormNotice>{error}</FormNotice> : null}

      <label htmlFor={amountId} className="block text-sm font-medium text-fg">
        Your offer (USD)
      </label>
      <p className="mt-1 text-xs text-subtle">
        Asking price is {usd(askingPrice)}. The seller has {expiryHours} hours
        to respond.
      </p>
      <input
        id={amountId}
        name="amount"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder={String(Math.round(askingPrice * 0.9))}
        className="mt-2 h-12 w-full rounded-xl border border-line bg-surface-2 px-3.5 text-base text-fg placeholder:text-subtle focus:border-primary/60 focus:outline-none sm:text-[0.9375rem]"
        required
      />
      {tooLow ? (
        <p className="mt-2 text-sm text-danger">
          That is less than half the asking price and will be refused.
        </p>
      ) : null}

      <label
        htmlFor={messageId}
        className="mt-4 block text-sm font-medium text-fg"
      >
        Message (optional)
      </label>
      <textarea
        id={messageId}
        name="message"
        rows={3}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Anything the seller should know about why you are offering this."
        className="mt-2 w-full rounded-xl border border-line bg-surface-2 p-3.5 text-base text-fg placeholder:text-subtle focus:border-primary/60 focus:outline-none sm:text-[0.9375rem]"
      />

      <Button
        type="submit"
        size="md"
        className="mt-4"
        disabled={pending || !amount.trim() || tooLow}
      >
        {pending ? "Sending…" : "Send offer"}
      </Button>
    </form>
  );
}
