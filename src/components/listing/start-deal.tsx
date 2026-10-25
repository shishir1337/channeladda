"use client";

import { CheckIcon, ShieldCheckIcon, ZapIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import type { DealMode, Platform } from "@/generated/prisma/enums";
import { useSession } from "@/lib/auth-client";
import { buyerTotal, type FeeSettings } from "@/lib/fees";
import { handoverTarget, parseHandoverTo } from "@/lib/handover-target";
import { threadHref } from "@/lib/thread-href";
import { cn } from "@/lib/utils";
import { startDeal } from "@/server/actions/deals";

/**
 * Choosing how to buy.
 *
 * The two modes are not tiers of service, they are two different things the
 * buyer is trusting, and the copy says which: in Safest the channel sits with
 * a Channel Adda agent before the buyer pays the seller directly; in Fastest
 * the buyer pays us everything up front and our agent takes the channel
 * from the seller and hands it on to them. Either way the figure they will be asked for now is on
 * screen before they commit.
 */
const MODES = [
  {
    id: "SAFEST" as const,
    label: "Safest",
    icon: ShieldCheckIcon,
    holds: "We hold the channel",
    // Three short lines, not a paragraph: the owner's clients read this on a
    // phone and went looking for the choice under the wall of text.
    steps: [
      "You pay our fee",
      "Our agent takes the channel",
      "You pay the seller, then get the channel",
    ],
  },
  {
    id: "FASTEST" as const,
    label: "Fastest",
    icon: ZapIcon,
    holds: "We hold the money",
    steps: [
      "You pay us the price and our fee",
      "Our agent takes the channel",
      "You get the channel, the seller gets paid",
    ],
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
   * deal's chat; from a conversation, nowhere — the conversation redraws with
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
      <fieldset disabled={pending} aria-describedby={`${groupId}-steps`}>
        <legend className="mb-2.5 text-[0.9375rem] font-semibold text-fg">
          Choose your deal
        </legend>
        {/* Two tiles side by side, even on a phone: the choice is the first
            thing in the panel and both options are visible at once. Real
            radio inputs, so arrow keys move between them. */}
        <div className="grid grid-cols-2 gap-2.5">
          {MODES.map((option) => {
            const selected = option.id === mode;
            return (
              <label
                key={option.id}
                className={cn(
                  "relative flex cursor-pointer flex-col rounded-card border p-3 transition-[border-color,background-color,box-shadow] duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40 sm:p-3.5",
                  selected
                    ? "border-primary bg-primary-soft shadow-xs"
                    : "border-line bg-surface hover:border-line-strong dark:bg-surface-2",
                )}
              >
                <input
                  type="radio"
                  name={groupId}
                  value={option.id}
                  checked={selected}
                  onChange={() => setMode(option.id)}
                  className="sr-only"
                />
                <span className="flex items-start justify-between gap-2">
                  <span
                    className={cn(
                      "inline-flex size-8 items-center justify-center rounded-lg",
                      selected
                        ? "bg-primary text-primary-fg"
                        : "bg-surface-2 text-muted dark:bg-surface-3",
                    )}
                  >
                    <option.icon aria-hidden="true" className="size-4" />
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "inline-flex size-5 items-center justify-center rounded-full border",
                      selected
                        ? "border-primary bg-primary text-primary-fg"
                        : "border-line-strong",
                    )}
                  >
                    {selected ? <CheckIcon className="size-3" /> : null}
                  </span>
                </span>
                <span className="mt-2.5 text-[0.9375rem] leading-5 font-semibold text-fg">
                  {option.label}
                </span>
                <span className="mt-0.5 text-xs leading-4 text-muted">
                  {option.holds}
                </span>
                <span className="mt-3 border-t border-line pt-2.5 text-[0.6875rem] text-subtle">
                  Pay now
                </span>
                <Price
                  usd={buyerTotal(price, fees, option.id).total}
                  className="tnum text-sm font-semibold text-fg"
                />
              </label>
            );
          })}
        </div>
      </fieldset>

      <ol id={`${groupId}-steps`} className="mt-3.5 flex flex-col gap-1.5">
        {chosen.steps.map((line, i) => (
          <li
            key={line}
            className="flex items-center gap-2.5 text-[0.8125rem] text-muted"
          >
            <span className="tnum inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[0.6875rem] font-semibold text-fg dark:bg-surface-3">
              {i + 1}
            </span>
            {line}
          </li>
        ))}
      </ol>

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
          I understand revenue, subscribers and monetization can change after
          the handover, and a drop is not grounds for a refund.
        </span>
      </label>

      <Button
        type="button"
        size="lg"
        className="mt-3 w-full"
        // Not disabled until the box is ticked: a grey button nobody can
        // press, with no word why, read as broken. It says what is missing.
        disabled={pending}
        onClick={() => {
          if (!session?.user) {
            router.push(`/signin?next=/listing/${listingSlug}`);
            return;
          }
          setError(null);
          if (!acceptedRisk) {
            setError("Tick the box above to continue.");
            document.getElementById(riskId)?.focus();
            return;
          }
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
            // Straight into the deal's chat, where it is paid for and run:
            // the deal page only pointed on to it.
            router.push(
              result.conversationId
                ? threadHref(result.conversationId, listingId)
                : `/dashboard/deals/${result.orderId}`,
            );
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
