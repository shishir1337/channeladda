"use client";

import { ShieldCheckIcon, ZapIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import type { DealMode } from "@/generated/prisma/enums";
import { useSession } from "@/lib/auth-client";
import { buyerTotal, type FeeSettings } from "@/lib/fees";
import { cn } from "@/lib/utils";
import { startDeal } from "@/server/actions/deals";

/**
 * Choosing how to buy.
 *
 * The two modes are not tiers of service, they are two different things the
 * buyer is trusting, and the copy says which: in Safest the channel sits with
 * a Channel Adda agent and the buyer pays the seller once it is there; in
 * Fastest Channel Adda holds the money instead. Whichever they pick, the
 * figure they will be asked for is on screen before they commit.
 */
const MODES = [
  {
    id: "SAFEST" as const,
    label: "Safest",
    icon: ShieldCheckIcon,
    holds: "We hold the channel",
    blurb:
      "Our agent takes ownership of the channel first. You pay the seller directly once it is verifiably in our hands, and we transfer it to you after that. Two Google waiting periods.",
    upfrontNote: "Up front you pay our fee only",
  },
  {
    id: "FASTEST" as const,
    label: "Fastest",
    icon: ZapIcon,
    holds: "We hold the money",
    blurb:
      "You pay us the full amount up front and our agent supervises while the seller transfers the channel straight to you. We pay the seller once you confirm access. One Google waiting period.",
    upfrontNote: "Up front you pay the price and our fee",
  },
];

export function StartDeal({
  listingId,
  listingSlug,
  price,
  fees,
  isOwnListing,
}: {
  listingId: string;
  listingSlug: string;
  price: number;
  fees: FeeSettings;
  isOwnListing: boolean;
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const groupId = useId();
  const [mode, setMode] = useState<DealMode>("SAFEST");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const chosen = MODES.find((m) => m.id === mode) ?? MODES[0];
  const { fee, total } = buyerTotal(price, fees, mode);

  if (isOwnListing) return null;

  return (
    <div className="mt-5">
      <fieldset
        className="grid gap-2.5"
        aria-describedby={`${groupId}-detail`}
        disabled={pending}
      >
        <legend className="mb-2.5 text-xs font-semibold tracking-[0.14em] text-subtle uppercase">
          How you want to buy
        </legend>
        {MODES.map((option) => {
          const selected = option.id === mode;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setMode(option.id)}
              className={cn(
                "flex w-full cursor-pointer items-start gap-3 rounded-card border p-3.5 text-left transition-colors duration-200",
                selected
                  ? "border-primary bg-primary-soft"
                  : "border-line hover:border-line-strong hover:bg-surface-2",
              )}
            >
              <option.icon
                aria-hidden="true"
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  selected ? "text-primary-text" : "text-muted",
                )}
              />
              <span className="min-w-0">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-semibold text-fg">
                    {option.label}
                  </span>
                  <span className="text-xs text-muted">{option.holds}</span>
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-muted">
                  {option.upfrontNote}:{" "}
                  <Price
                    usd={buyerTotal(price, fees, option.id).total}
                    className="font-medium text-fg"
                  />
                </span>
              </span>
            </button>
          );
        })}
      </fieldset>

      <p
        id={`${groupId}-detail`}
        className="mt-3 text-xs leading-relaxed text-muted"
      >
        {chosen.blurb}
      </p>

      <dl className="mt-4 space-y-2 border-y border-line py-3.5 text-sm">
        {mode === "FASTEST" ? (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">Channel price</dt>
            <dd>
              <Price usd={price} />
            </dd>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted">Our fee</dt>
          <dd>
            <Price usd={fee} />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 pt-1 font-semibold">
          <dt>You pay now</dt>
          <dd>
            <Price usd={total} className="text-base" />
          </dd>
        </div>
        {mode === "SAFEST" ? (
          <div className="flex items-center justify-between gap-3 text-xs text-subtle">
            <dt>Then, direct to the seller</dt>
            <dd>
              <Price usd={price} />
            </dd>
          </div>
        ) : null}
      </dl>

      <Button
        type="button"
        size="lg"
        className="mt-4 w-full"
        disabled={pending}
        onClick={() => {
          if (!session?.user) {
            router.push(`/signin?next=/listing/${listingSlug}`);
            return;
          }
          setError(null);
          startTransition(async () => {
            const result = await startDeal(listingId, mode);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.push(`/dashboard/deals/${result.orderId}`);
          });
        }}
      >
        {pending ? "Opening…" : `Start a ${chosen.label} deal`}
      </Button>

      {error ? (
        <p role="alert" className="mt-2.5 text-center text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
