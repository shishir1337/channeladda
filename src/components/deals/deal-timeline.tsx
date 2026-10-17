"use client";

import {
  CheckIcon,
  ClockIcon,
  LoaderCircleIcon,
  ShieldAlertIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { TextField } from "@/components/auth/fields";
import {
  ACTOR_LABELS,
  actorLabel,
  HOLD_NOTE,
  isHoldStep,
  needsPaymentRef,
  stepHelp,
} from "@/components/deals/deal-status";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { completeStep, endDeal } from "@/server/actions/deals";
import type { DealStepView, DealView } from "@/server/deals";

/**
 * The deal, step by step, as both sides and the agent see it.
 *
 * Split in two deliberately. `DealNextStep` is the one card that answers
 * "what do I do now?" and is the only place an action button appears;
 * `DealSteps` is the record of the whole choreography, where everything
 * already done recedes and nothing competes with the action above it. A flat
 * list of nine equal rows made the current step as easy to miss as the first.
 *
 * One timeline rather than a view per role: everybody looking at a deal needs
 * to know the same things — what has happened, what is happening now, who it
 * is waiting on. Only the button changes, and only for the person whose step
 * it is.
 */

/** Clearer than "Mark this done" where the step is a statement of fact. */
const CONFIRM_LABELS: Record<string, string> = {
  "Pay the seller directly": "I have sent the payment",
  "Confirm the payment arrived": "The money has arrived",
  "Confirm access received": "I have access to the channel",
  "Inspect the channel": "I have checked the channel",
  "Invite the agent as channel owner": "I have sent the invite",
  "Invite the agent as manager": "I have sent the invite",
  "Promote the buyer to primary owner": "I have promoted the buyer",
};

function confirmLabel(label: string) {
  return CONFIRM_LABELS[label] ?? "Mark this done";
}

/**
 * The one card that says what happens next, and the only one with a button.
 *
 * Renders nothing once a deal has stopped — a closed deal has no next move,
 * and the status block above it has already said so.
 */
export function DealNextStep({
  deal,
  staffIds,
}: {
  deal: DealView;
  /**
   * Staff who can second a high-value handover. Resolved on the server: the
   * agent has to name somebody, and offering a list beats asking them to
   * paste a user id.
   */
  staffIds?: { id: string; name: string }[];
}) {
  const step = deal.nextStep;
  if (!step) return null;

  // A dispute freezes every step, so the person whose turn it nominally is
  // must not be offered a button the server will refuse.
  const frozen = deal.status === "DISPUTED";
  // The recovery hold: the release step exists, and is not available yet.
  // Offering the button would only produce a refusal.
  const heldUntil =
    deal.holdUntil && new Date(deal.holdUntil) > new Date()
      ? new Date(deal.holdUntil)
      : null;
  const mine = !frozen && !heldUntil && step.actor === deal.viewerRole;
  const help = stepHelp(step.label);
  const hold = isHoldStep(step.label);
  // Step 1 is completed by the payment clearing and by nothing else, so the
  // buyer gets the payment panel rather than a button the server will refuse.
  const paymentPending = deal.status === "AWAITING_PAYMENT";

  return (
    <section
      aria-labelledby="next-step-heading"
      className={cn(
        "rounded-panel border p-5 sm:p-6",
        mine ? "border-primary/40 bg-primary-soft" : "border-line bg-surface",
      )}
    >
      <p className="flex flex-wrap items-center gap-2 font-mono text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
        {mine ? (
          <>
            <span
              aria-hidden="true"
              className="size-1.5 animate-pulse-dot rounded-full bg-primary"
            />
            <span className="text-primary-text">Your move</span>
          </>
        ) : (
          <span className="text-subtle">
            {frozen ? "Paused" : `Waiting on ${ACTOR_LABELS[step.actor]}`}
          </span>
        )}
        <span className="tnum ml-auto font-normal tracking-normal text-subtle">
          Step {step.position} of {deal.steps.length}
        </span>
      </p>

      <h2
        id="next-step-heading"
        className="mt-2.5 font-display text-lg leading-snug font-bold text-fg sm:text-xl"
      >
        {step.label}
      </h2>

      {help ? (
        <p className="mt-2 max-w-[62ch] text-[0.9375rem] leading-relaxed text-muted">
          {help}
        </p>
      ) : null}

      {!mine ? (
        <p className="mt-2 text-sm leading-relaxed text-subtle">
          {frozen
            ? "This step is where the deal stopped. It stays here until a moderator decides the dispute."
            : "Nothing is needed from you right now. Your deals list flags this one under “Waiting on you” the moment it is your turn."}
        </p>
      ) : null}

      {heldUntil ? (
        <p className="mt-3 flex items-start gap-2.5 rounded-card border border-primary/30 bg-primary-soft px-3.5 py-3 text-sm leading-relaxed text-fg">
          <ClockIcon
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-primary-text"
          />
          <span>
            <span className="font-semibold">
              Recovery hold until{" "}
              {heldUntil.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
              })}
              .
            </span>{" "}
            That is the window in which an old owner could still try to reclaim
            the account. The seller is paid when it ends; until then the money
            stays with Channel Adda.
          </span>
        </p>
      ) : null}

      {hold ? (
        <p className="mt-3 flex items-start gap-2.5 rounded-card border border-line bg-surface px-3.5 py-3 text-sm leading-relaxed text-muted">
          <ClockIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{HOLD_NOTE}</span>
        </p>
      ) : null}

      {mine ? (
        paymentPending ? (
          <p className="mt-4 rounded-card border border-line bg-surface px-3.5 py-3 text-sm leading-relaxed text-muted">
            This step ticks itself off the moment your payment clears. There is
            no button for it, so nobody can record a payment that has not
            arrived.
          </p>
        ) : (
          <StepAction deal={deal} step={step} staffIds={staffIds} />
        )
      ) : null}
    </section>
  );
}

function StepAction({
  deal,
  step,
  staffIds,
}: {
  deal: DealView;
  step: DealStepView;
  staffIds?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const refId = useId();
  const approverId = useId();
  const [paymentRef, setPaymentRef] = useState("");
  const [approvedById, setApprovedById] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const wantsRef = needsPaymentRef(step.label);
  // Offered whenever the server says this step can need a second signature.
  // The server decides whether it is actually required for this price, so a
  // blank selection is fine below the threshold.
  const wantsApprover = Boolean(staffIds && staffIds.length > 0);
  const blocked = wantsRef && paymentRef.trim() === "";

  return (
    <div className="mt-4">
      {wantsRef ? (
        <div className="rounded-card border border-line bg-surface p-3.5 sm:p-4">
          <p className="max-w-[62ch] text-sm leading-relaxed text-muted">
            Send the agreed amount to the seller, then paste the transaction
            reference. It is what lets Channel Adda settle a disagreement about
            whether the money arrived — without it there is only one person's
            word against another's.
          </p>
          <TextField
            id={refId}
            name="paymentRef"
            label="Transaction reference"
            hint="The id, hash or receipt number your bank or wallet gave you."
            value={paymentRef}
            onChange={(e) => setPaymentRef(e.target.value)}
            className="mt-3 max-w-sm"
            required
          />
        </div>
      ) : null}

      {wantsApprover ? (
        <div
          className={cn(
            "max-w-sm rounded-card border border-line bg-surface p-3.5 sm:p-4",
            wantsRef && "mt-3",
          )}
        >
          <label
            htmlFor={approverId}
            className="block text-sm font-medium text-fg"
          >
            Second approval from
          </label>
          <select
            id={approverId}
            value={approvedById}
            onChange={(e) => setApprovedById(e.target.value)}
            className="mt-2 h-12 w-full cursor-pointer rounded-xl border border-line bg-surface-2 px-3 text-base text-fg focus:border-primary/60 focus:outline-none sm:text-[0.9375rem]"
          >
            <option value="">No second approver</option>
            {staffIds?.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs leading-relaxed text-subtle">
            Required above the platform's threshold. Recorded against your name
            and theirs in the audit trail — only name someone who has actually
            agreed to it.
          </p>
        </div>
      ) : null}

      <Button
        type="button"
        size="lg"
        className={cn(
          "w-full sm:w-auto",
          (wantsRef || wantsApprover) && "mt-4",
        )}
        disabled={pending || blocked}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await completeStep(deal.id, step.position, {
              ...(wantsRef ? { paymentRef: paymentRef.trim() } : {}),
              ...(approvedById ? { approvedById } : {}),
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        {pending ? (
          <>
            <LoaderCircleIcon
              aria-hidden="true"
              className="size-4 animate-spin"
            />
            Saving…
          </>
        ) : (
          <>
            <CheckIcon aria-hidden="true" className="size-4" />
            {confirmLabel(step.label)}
          </>
        )}
      </Button>

      {blocked ? (
        <p className="mt-2 text-xs text-subtle">
          Add the transaction reference to continue.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2.5 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The whole choreography, in order.
 *
 * Done steps recede to a tick and a date; the step in play keeps its weight
 * and says so in words as well as colour; later steps are numbered and quiet.
 * The action for the current step is not here — it is in the card above, so
 * there is only ever one button on the screen.
 */
export function DealSteps({ deal }: { deal: DealView }) {
  const doneCount = deal.steps.filter((s) => s.completedAt !== null).length;

  return (
    <section aria-labelledby="steps-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          id="steps-heading"
          className="font-display text-base font-bold text-fg"
        >
          What happens, in order
        </h2>
        <p className="tnum text-xs text-subtle">
          {doneCount} of {deal.steps.length} done
        </p>
      </div>

      <ol className="mt-4 flex flex-col">
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
    </section>
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

  return (
    <li className="flex gap-3.5">
      <div className="flex flex-col items-center">
        <span
          aria-hidden="true"
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full border",
            done && "border-verified bg-verified text-white",
            !done && isNext && "border-primary bg-primary text-primary-fg",
            !done && !isNext && "border-line bg-surface-2",
          )}
        >
          {done ? (
            <CheckIcon className="size-3.5" />
          ) : (
            <span
              className={cn(
                "tnum text-[0.6875rem] font-semibold",
                !isNext && "font-normal text-subtle",
              )}
            >
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
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <p
            className={cn(
              "text-sm",
              done && "text-muted",
              isNext && "font-semibold text-fg",
              !done && !isNext && "font-medium text-muted",
            )}
          >
            {step.label}
          </p>
          {isNext ? (
            <span className="rounded-full border border-primary/30 bg-primary-soft px-2 py-0.5 font-mono text-[0.625rem] font-semibold tracking-[0.1em] text-primary-text uppercase">
              You are here
            </span>
          ) : null}
        </div>

        <p className="mt-0.5 text-xs text-subtle">
          {done ? (
            <>
              Done by {actorLabel(step.actor, deal.viewerRole)} on{" "}
              {step.completedAt?.toLocaleDateString("en-GB")}
            </>
          ) : isNext ? (
            <>Waiting on {actorLabel(step.actor, deal.viewerRole)}</>
          ) : (
            <>Then {ACTOR_LABELS[step.actor]}</>
          )}
        </p>

        {step.proofUrl ? (
          <a
            href={step.proofUrl}
            className="mt-1.5 inline-flex min-h-8 items-center text-xs font-medium text-primary-text underline underline-offset-4"
          >
            Proof attached
          </a>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Either side, when something has gone wrong.
 *
 * Without this the only way out of a stalled deal was for staff to notice.
 * A dispute freezes the steps and puts a human on it, which is the whole
 * point of the fee.
 */
export function RaiseDispute({ deal }: { deal: DealView }) {
  const router = useRouter();
  const noteId = useId();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (deal.viewerRole !== "buyer" && deal.viewerRole !== "seller") return null;
  // Already raised: a second one is refused, so it is not offered.
  if (deal.status === "DISPUTED") return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted underline-offset-4 transition-colors duration-200 hover:text-fg hover:underline"
      >
        <ShieldAlertIcon aria-hidden="true" className="size-4 shrink-0" />
        Something is wrong with this deal
      </button>
    );
  }

  return (
    <div className="rounded-panel border border-line bg-surface p-5 sm:p-6">
      <h2 className="font-display text-base font-bold text-fg">
        Raise this with us
      </h2>
      <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-muted">
        The deal stops where it is and a moderator reads the whole record,
        including every step and the payment references on it. Nothing moves
        again until they decide.
      </p>
      <TextField
        id={noteId}
        name="note"
        label="What has gone wrong"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="mt-4 max-w-md"
        required
      />
      <div className="mt-4 flex flex-wrap gap-2.5">
        <Button
          type="button"
          size="md"
          disabled={pending || note.trim() === ""}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await endDeal(deal.id, "DISPUTED", note.trim());
              if (!result.ok) {
                setError(result.error);
                return;
              }
              router.refresh();
            });
          }}
        >
          {pending ? (
            <>
              <LoaderCircleIcon
                aria-hidden="true"
                className="size-4 animate-spin"
              />
              Sending…
            </>
          ) : (
            "Raise it"
          )}
        </Button>
        <Button
          type="button"
          size="md"
          variant="ghost"
          disabled={pending}
          onClick={() => setOpen(false)}
        >
          Never mind
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mt-2.5 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
