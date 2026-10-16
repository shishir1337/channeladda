"use client";

import { CheckIcon, ClockIcon, LoaderIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { TextField } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { completeStep, endDeal } from "@/server/actions/deals";
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

export function DealTimeline({
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
  return (
    <>
      <ol className="mt-6 flex flex-col">
        {deal.steps.map((step, index) => (
          <Step
            key={step.position}
            deal={deal}
            step={step}
            staffIds={staffIds}
            isNext={deal.nextStep?.position === step.position}
            isLast={index === deal.steps.length - 1}
          />
        ))}
      </ol>
      {deal.nextStep ? <RaiseDispute deal={deal} /> : null}
    </>
  );
}

/**
 * Either side, when something has gone wrong.
 *
 * Without this the only way out of a stalled deal was for staff to notice.
 * A dispute freezes the steps and puts a human on it, which is the whole
 * point of the fee.
 */
function RaiseDispute({ deal }: { deal: DealView }) {
  const router = useRouter();
  const noteId = useId();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (deal.viewerRole !== "buyer" && deal.viewerRole !== "seller") return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 cursor-pointer text-xs text-subtle underline transition-colors duration-200 hover:text-fg"
      >
        Something is wrong with this deal
      </button>
    );
  }

  return (
    <div className="mt-5 rounded-card border border-line bg-surface-2 p-4">
      <p className="text-sm font-semibold text-fg">Raise this with us</p>
      <p className="mt-1.5 text-xs leading-relaxed text-muted">
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
        className="mt-3"
        required
      />
      <div className="mt-3 flex flex-wrap gap-2.5">
        <Button
          type="button"
          size="sm"
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
          {pending ? "Sending…" : "Raise it"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setOpen(false)}
        >
          Never mind
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Step({
  deal,
  step,
  staffIds,
  isNext,
  isLast,
}: {
  deal: DealView;
  step: DealStepView;
  staffIds?: { id: string; name: string }[];
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

        {mine ? (
          <StepAction deal={deal} step={step} staffIds={staffIds} />
        ) : null}
      </div>
    </li>
  );
}

/** Needs a transaction reference: the buyer paying the seller directly. */
function needsPaymentRef(label: string) {
  return label === "Pay the seller directly";
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

      {wantsApprover ? (
        <div className="mb-3 max-w-sm">
          <label
            htmlFor={approverId}
            className="mb-1.5 block text-sm font-medium text-fg"
          >
            Second approval from
          </label>
          <select
            id={approverId}
            value={approvedById}
            onChange={(e) => setApprovedById(e.target.value)}
            className="h-11 w-full cursor-pointer rounded-xl border border-line bg-surface px-3 text-sm text-fg"
          >
            <option value="">No second approver</option>
            {staffIds?.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs leading-relaxed text-subtle">
            Required above the platform's threshold. Recorded against your name
            and theirs in the audit trail — only name someone who has actually
            agreed to it.
          </p>
        </div>
      ) : null}

      <Button
        type="button"
        size="md"
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
