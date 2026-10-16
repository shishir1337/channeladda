"use client";

import { CheckIcon, ClockIcon, LoaderIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { TextField } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { completeStep } from "@/server/actions/deals";
import type { DealStepView, DealView } from "@/server/deals";

/**
 * The deal, step by step, as both sides and the agent see it.
 *
 * One timeline rather than a view per role: everybody looking at a deal needs
 * to know the same thing — what has happened, what is happening now, and who
 * it is waiting on. Only the button changes, and only for the person whose
 * step it is.
 *
 * The two holding steps say "usually about seven days" and never a date. The
 * wait is Google's, not ours, and there is no API that reports when a Brand
 * Account transfer completes — the agent confirms it by looking. Promising a
 * date we cannot see would be the one thing on this page that is not true.
 */
const HOLD_NOTE =
  "Google's own waiting period, usually about 7 days. Our agent confirms it the moment it completes.";

function isHoldStep(label: string) {
  return label.startsWith("Hold ");
}

const ACTOR_LABELS = {
  buyer: "the buyer",
  seller: "the seller",
  agent: "our agent",
  staff: "Channel Adda",
  system: "Channel Adda",
} as const;

export function DealTimeline({ deal }: { deal: DealView }) {
  return (
    <ol className="mt-6 flex flex-col">
      {deal.steps.map((step, index) => (
        <Step
          key={step.position}
          deal={deal}
          step={step}
          isNext={deal.nextStep?.position === step.position}
          isLast={index === deal.steps.length - 1}
        />
      ))}
    </ol>
  );
}

function Step({
  deal,
  step,
  isNext,
  isLast,
}: {
  deal: DealView;
  step: DealStepView;
  isNext: boolean;
  isLast: boolean;
}) {
  const done = step.completedAt !== null;
  const mine = isNext && step.actor === deal.viewerRole;

  return (
    <li className="flex gap-3.5">
      <div className="flex flex-col items-center">
        <span
          aria-hidden="true"
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full border",
            done && "border-verified bg-verified text-white",
            !done && isNext && "border-primary bg-primary-soft",
            !done && !isNext && "border-line bg-surface-2",
          )}
        >
          {done ? (
            <CheckIcon className="size-3.5" />
          ) : isNext ? (
            <LoaderIcon className="size-3.5 text-primary-text" />
          ) : (
            <span className="tnum text-[0.6875rem] text-subtle">
              {step.position}
            </span>
          )}
        </span>
        {!isLast ? (
          <span
            aria-hidden="true"
            className={cn(
              "my-1 w-px flex-1",
              done ? "bg-verified/40" : "bg-line",
            )}
          />
        ) : null}
      </div>

      <div className={cn("min-w-0 flex-1", isLast ? "pb-0" : "pb-6")}>
        <p
          className={cn(
            "text-sm font-semibold",
            done ? "text-muted" : "text-fg",
          )}
        >
          {step.label}
        </p>
        <p className="mt-0.5 text-xs text-subtle">
          {done ? (
            <>
              Done by {ACTOR_LABELS[step.actor]} on{" "}
              {step.completedAt?.toLocaleDateString("en-GB")}
            </>
          ) : isNext ? (
            <>Waiting on {ACTOR_LABELS[step.actor]}</>
          ) : (
            <>Then {ACTOR_LABELS[step.actor]}</>
          )}
        </p>

        {isNext && isHoldStep(step.label) ? (
          <p className="mt-2 flex items-start gap-2 rounded-card border border-line bg-surface-2 p-2.5 text-xs leading-relaxed text-muted">
            <ClockIcon
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0"
            />
            <span>{HOLD_NOTE}</span>
          </p>
        ) : null}

        {step.proofUrl ? (
          <a
            href={step.proofUrl}
            className="mt-2 inline-flex text-xs text-primary-text underline"
          >
            Proof attached
          </a>
        ) : null}

        {mine ? <StepAction deal={deal} step={step} /> : null}
      </div>
    </li>
  );
}

/** Needs a transaction reference: the buyer paying the seller directly. */
function needsPaymentRef(label: string) {
  return label === "Pay the seller directly";
}

function StepAction({ deal, step }: { deal: DealView; step: DealStepView }) {
  const router = useRouter();
  const refId = useId();
  const [paymentRef, setPaymentRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const wantsRef = needsPaymentRef(step.label);
  const blocked = wantsRef && paymentRef.trim() === "";

  return (
    <div className="mt-3">
      {wantsRef ? (
        <>
          <p className="mb-2.5 text-xs leading-relaxed text-muted">
            Send the agreed amount to the seller, then paste the transaction
            reference. It is what lets Channel Adda settle a disagreement about
            whether the money arrived — without it there is only one person's
            word against another's.
          </p>
          <TextField
            id={refId}
            name="paymentRef"
            label="Transaction reference"
            value={paymentRef}
            onChange={(e) => setPaymentRef(e.target.value)}
            className="mb-3 max-w-sm"
            required
          />
        </>
      ) : null}

      <Button
        type="button"
        size="md"
        disabled={pending || blocked}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await completeStep(
              deal.id,
              step.position,
              wantsRef ? { paymentRef: paymentRef.trim() } : undefined,
            );
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        {pending ? "Saving…" : "Mark this done"}
      </Button>

      {error ? (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
