"use client";

import { LockIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import { useHydrated } from "@/lib/use-hydrated";
import { makeOffer } from "@/server/actions/offers";

/**
 * Take the asking price, without haggling for it.
 *
 * A buyer who is happy with the price should never be forced through a
 * negotiation to get it. Until checkout exists this sends the seller a
 * full-price offer, which they confirm — and the listing is then held for
 * that buyer and nobody else. The day checkout lands this button goes
 * straight to payment instead; nothing else on the page has to change.
 */
export function BuyAtAsking({
  listingId,
  listingSlug,
  price,
  isOwnListing,
}: {
  listingId: string;
  listingSlug: string;
  price: number;
  isOwnListing: boolean;
}) {
  const hydrated = useHydrated();
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const asking = price.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

  if (isOwnListing) {
    return (
      <p className="rounded-xl border border-line bg-surface-2 p-3 text-xs leading-relaxed text-muted">
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

  if (done) {
    return (
      <div className="rounded-xl border border-verified/30 bg-verified-soft p-4">
        <p className="text-sm text-fg">{done}</p>
        <Button asChild variant="secondary" size="md" className="mt-3">
          <Link href="/dashboard/offers">Track it in your offers</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      {error ? (
        <p
          role="alert"
          className="mb-2.5 rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-xs text-fg"
        >
          {error}
        </p>
      ) : null}

      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={pending || !hydrated || isPending}
        onClick={() => {
          if (!session?.user) {
            router.push(`/signin?next=/listing/${listingSlug}`);
            return;
          }
          setError(null);
          startTransition(async () => {
            const result = await makeOffer(listingId, price, "");
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setDone(
              `Sent at the full asking price of ${asking}. Once the seller confirms, this listing is held for you and nobody else can buy it.`,
            );
            router.refresh();
          });
        }}
      >
        <LockIcon aria-hidden="true" className="size-4" />
        {pending ? "Sending…" : `Buy at ${asking}`}
      </Button>
    </>
  );
}
