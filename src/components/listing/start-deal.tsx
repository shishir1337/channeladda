"use client";

import { ShieldCheckIcon, ZapIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import type { DealMode, Platform } from "@/generated/prisma/enums";
import { useSession } from "@/lib/auth-client";
import { buyerTotal, type FeeSettings } from "@/lib/fees";
import { handoverTarget, parseHandoverTo } from "@/lib/handover-target";
import { cn } from "@/lib/utils";
import { startDeal } from "@/server/actions/deals";

/**
 * Choosing how to buy.
 *
 * The two modes are not tiers of service, they are two different things the
 * buyer is trusting, and the copy says which: in Safest the channel sits with
 * a Channel Adda agent before the buyer pays the seller directly; in Fastest
 * the buyer pays us everything up front and the seller hands the channel
 * over to them. Either way the figure they will be asked for now is on
 * screen before they commit.
 */
const MODES = [
  {
    id: "SAFEST" as const,
    label: "Safest",
    icon: ShieldCheckIcon,
    holds: "We hold the channel",
    blurb:
      "Our agent takes ownership of the channel first. Then you pay the seller directly, and once they confirm it arrived, our agent makes you the owner.",
    upfrontNote: "Up front you pay our fee only",
  },
  {
    id: "FASTEST" as const,
    label: "Fastest",
    icon: ZapIcon,
    holds: "We hold the money",
    blurb:
      "You pay us the full amount up front. The seller makes you a manager and, after the holding period, primary owner, with our agent watching. We pay the seller once you are primary owner.",
    upfrontNote: "Up front you pay the price and our fee",
  },
];

export function StartDeal({
  listingId,
  listingSlug,
  platform,
  price,
  fees,
  isOwnListing,
  after = "deal-page",
}: {
  listingId: string;
  listingSlug: string;
  /** Decides what the buyer is asked for: a Google account, a username… */
  platform: Platform;
  price: number;
  fees: FeeSettings;
  isOwnListing: boolean;
  /**
   * Where the buyer goes once the deal is open. From the listing, to the
   * deal page; from a conversation, nowhere — the conversation redraws with
   * the payment card, and the buyer never has to leave it.
   */
  after?: "deal-page" | "refresh";
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const groupId = useId();
  const [mode, setMode] = useState<DealMode>("SAFEST");
  // The refund policy, the Terms and the help centre all say a buyer
  // acknowledges this at checkout, and nothing ever asked. A platform that
  // refuses a dispute on the basis of a consent it cannot produce is in a
  // worse position than one that never claimed it.
  const [acceptedRisk, setAcceptedRisk] = useState(false);
  const riskId = useId();
  const handoverId = useId();
  const target = handoverTarget(platform);
  const [handoverTo, setHandoverTo] = useState("");
  const [handoverError, setHandoverError] = useState<string | null>(null);
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
        <legend className="mb-2 text-[0.8125rem] font-medium text-subtle">
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
                "flex w-full cursor-pointer items-start gap-3 rounded-card border p-3.5 text-left transition-colors duration-150",
                selected
                  ? "border-fg/80 bg-surface-2/60 ring-1 ring-fg/10"
                  : "border-line hover:border-line-strong hover:bg-surface-2",
              )}
            >
              <option.icon
                aria-hidden="true"
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  selected ? "text-fg" : "text-subtle",
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
        {/* Google's own wait before a manager can be made owner; the other
            platforms have nothing like it. */}
        {mode === "SAFEST" && platform === "YOUTUBE"
          ? " One Google waiting period."
          : null}
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
            <dt>Then, to the seller once our agent holds it</dt>
            <dd>
              <Price usd={price} />
            </dd>
          </div>
        ) : null}
      </dl>

      {/* Asked here, before paying, so whoever transfers the account never
          has to come back and ask for it. */}
      <div className="mt-4">
        <label
          htmlFor={handoverId}
          className="block text-[0.8125rem] font-medium text-fg"
        >
          {target.label}
        </label>
        <input
          id={handoverId}
          type={platform === "TELEGRAM" ? "text" : "email"}
          inputMode={platform === "TELEGRAM" ? "text" : "email"}
          autoComplete={platform === "TELEGRAM" ? "username" : "email"}
          autoCapitalize="none"
          spellCheck={false}
          value={handoverTo}
          placeholder={target.placeholder}
          onChange={(e) => {
            setHandoverTo(e.target.value);
            if (handoverError) setHandoverError(null);
          }}
          onBlur={() => {
            if (!handoverTo.trim()) return;
            const parsed = parseHandoverTo(platform, handoverTo);
            setHandoverError(parsed.ok ? null : parsed.error);
          }}
          aria-invalid={handoverError ? true : undefined}
          aria-describedby={`${handoverId}-hint`}
          disabled={pending}
          className={cn(
            "mt-1.5 h-11 w-full rounded-lg border bg-surface px-3 text-sm text-fg shadow-xs transition-colors duration-150 placeholder:text-subtle hover:border-line-strong focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60 dark:bg-surface-2",
            handoverError ? "border-danger" : "border-line",
          )}
        />
        <p
          id={`${handoverId}-hint`}
          className={cn(
            "mt-1.5 text-xs leading-relaxed",
            handoverError ? "text-danger" : "text-subtle",
          )}
        >
          {handoverError ?? target.hint}
        </p>
      </div>

      <label
        htmlFor={riskId}
        className="mt-4 flex gap-2.5 text-xs leading-relaxed text-muted"
      >
        <input
          id={riskId}
          type="checkbox"
          checked={acceptedRisk}
          onChange={(e) => setAcceptedRisk(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 cursor-pointer accent-fg"
        />
        <span>
          I understand that revenue, subscriber counts and monetization can
          change after a handover, that no part of that is guaranteed by Channel
          Adda, and that a drop afterwards is not grounds for a refund.
        </span>
      </label>

      <Button
        type="button"
        size="lg"
        className="mt-3 w-full"
        disabled={pending || !acceptedRisk}
        onClick={() => {
          if (!session?.user) {
            router.push(`/signin?next=/listing/${listingSlug}`);
            return;
          }
          setError(null);
          const parsed = parseHandoverTo(platform, handoverTo);
          if (!parsed.ok) {
            setHandoverError(parsed.error);
            document.getElementById(handoverId)?.focus();
            return;
          }
          startTransition(async () => {
            const result = await startDeal(
              listingId,
              mode,
              acceptedRisk,
              parsed.value,
            );
            if (!result.ok) {
              setError(result.error);
              return;
            }
            if (after === "refresh") {
              router.refresh();
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
