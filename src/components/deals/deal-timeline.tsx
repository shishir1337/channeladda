"use client";

import {
  CheckIcon,
  ClockIcon,
  InfoIcon,
  LoaderCircleIcon,
  ShieldAlertIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type ComponentType,
  type ReactNode,
  type SVGProps,
  useId,
  useState,
  useTransition,
} from "react";
import {
  Card,
  Dot,
  hintClass,
  inputClass,
  labelClass,
  TurnFlag,
} from "@/components/app/kit";
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
import { isTerminal } from "@/lib/deal-machine";
import { cn } from "@/lib/utils";
import { completeStep, endDeal } from "@/server/actions/deals";
import type { DealStepView, DealView } from "@/server/deals";

/**
 * The deal, step by step, as both sides and the agent see it.
 *
 * Two ways in, one set of parts. On the deal page `DealSteps` is the whole
 * choreography: everything already done recedes, and the step in play keeps
 * its weight and carries its own action, so the one button on the screen
 * sits beside the step it completes. The conversation has no room for the
 * whole list, so there `DealNextStep` is that one step as a card. Both draw
 * the step's detail and its button from `StepDetail`, so they cannot drift
 * apart. A flat list of nine equal rows made the current step as easy to
 * miss as the first.
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

type StaffList = { id: string; name: string }[];

/**
 * What the step in play means for this reader: whether it is theirs to do,
 * and what, if anything, stands in the way.
 */
function stepState(deal: DealView, step: DealStepView) {
  // A dispute freezes every step, so the person whose turn it nominally is
  // must not be offered a button the server will refuse.
  const frozen = deal.status === "DISPUTED";
  // The recovery hold: the release step exists, and is not available yet.
  // Offering the button would only produce a refusal.
  const heldUntil =
    deal.holdUntil && new Date(deal.holdUntil) > new Date()
      ? new Date(deal.holdUntil)
      : null;
  return {
    frozen,
    heldUntil,
    mine: !frozen && !heldUntil && step.actor === deal.viewerRole,
    help: stepHelp(step.label),
    hold: isHoldStep(step.label),
    // Step 1 is completed by the payment clearing and by nothing else, so the
    // buyer gets the payment panel rather than a button the server will
    // refuse.
    paymentPending: deal.status === "AWAITING_PAYMENT",
  };
}

type StepState = ReturnType<typeof stepState>;

/**
 * A button label that keeps the button's width while its action runs.
 *
 * The idle label and the busy one are stacked in the same grid cell and
 * only one is visible, so the button is always as wide as the wider of the
 * two and a row of buttons never jumps. The hidden one is `invisible`, which
 * also takes it out of the accessible name.
 */
export function BusyLabel({
  busy,
  busyText,
  children,
}: {
  busy: boolean;
  busyText: string;
  children: ReactNode;
}) {
  return (
    <span className="inline-grid gap-[inherit] *:col-start-1 *:row-start-1">
      <span
        className={cn(
          "inline-flex items-center justify-center gap-[inherit]",
          busy && "invisible",
        )}
      >
        {children}
      </span>
      <span
        className={cn(
          "inline-flex items-center justify-center gap-[inherit]",
          !busy && "invisible",
        )}
      >
        <LoaderCircleIcon
          aria-hidden="true"
          className={cn(busy && "animate-spin")}
        />
        {busyText}
      </span>
    </span>
  );
}

/** Whose step it is, in words — gold only when it is the reader's. */
function Whose({ state, who }: { state: StepState; who: string }) {
  if (state.mine) return <TurnFlag mine />;
  if (state.frozen) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
        <Dot tone="danger" />
        Paused
      </span>
    );
  }
  return (
    <span className="text-xs font-medium text-muted">Waiting on {who}</span>
  );
}

/** A quiet aside inside a step: a waiting period, why there is no button. */
function Note({
  icon: Icon = InfoIcon,
  children,
}: {
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  children: ReactNode;
}) {
  return (
    <div className="mt-3 flex max-w-[62ch] items-start gap-2.5 rounded-lg border border-line bg-surface-2/60 px-3 py-2.5">
      <Icon
        aria-hidden="true"
        className="mt-0.5 size-3.5 shrink-0 text-subtle"
      />
      <p className="min-w-0 text-[0.8125rem] leading-relaxed text-muted">
        {children}
      </p>
    </div>
  );
}

/**
 * The step in play as a card of its own, for the conversation, where the
 * whole list does not fit. The deal page draws the same step inside
 * `DealSteps`.
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
  staffIds?: StaffList;
}) {
  const step = deal.nextStep;
  if (!step) return null;
  const state = stepState(deal, step);

  return (
    <Card className="@container">
      <section aria-labelledby="next-step-heading" className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Whose state={state} who={ACTOR_LABELS[step.actor]} />
          <span className="ml-auto text-xs text-subtle tabular-nums">
            Step {step.position} of {deal.steps.length}
          </span>
        </div>
        <h2
          id="next-step-heading"
          className="mt-2.5 text-[0.9375rem] leading-6 font-semibold text-fg"
        >
          {step.label}
        </h2>
        <StepDetail deal={deal} step={step} state={state} staffIds={staffIds} />
      </section>
    </Card>
  );
}

/**
 * Everything under the step in play: what it involves, what is in the way,
 * and — for the person whose step it is — the button.
 */
function StepDetail({
  deal,
  step,
  state,
  staffIds,
}: {
  deal: DealView;
  step: DealStepView;
  state: StepState;
  staffIds?: StaffList;
}) {
  return (
    <>
      {state.help ? (
        <p className="mt-1.5 max-w-[62ch] text-[0.8125rem] leading-relaxed text-muted">
          {state.help}
        </p>
      ) : null}

      {!state.mine ? (
        <p className="mt-2 max-w-[62ch] text-[0.8125rem] leading-relaxed text-subtle">
          {state.frozen
            ? "This step is where the deal stopped. It stays here until a moderator decides the dispute."
            : "Nothing is needed from you right now. Your deals list flags this one under “Waiting on you” the moment it is your turn."}
        </p>
      ) : null}

      {state.heldUntil ? (
        <Note icon={ClockIcon}>
          <span className="font-medium text-fg tabular-nums">
            Recovery hold until{" "}
            {state.heldUntil.toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
            })}
            .
          </span>{" "}
          That is the window in which an old owner could still try to reclaim
          the account. The seller is paid when it ends; until then the money
          stays with Channel Adda.
        </Note>
      ) : null}

      {state.hold ? <Note icon={ClockIcon}>{HOLD_NOTE}</Note> : null}

      {state.mine ? (
        state.paymentPending ? (
          <Note>
            This step ticks itself off the moment your payment clears. There is
            no button for it, so nobody can record a payment that has not
            arrived.
          </Note>
        ) : (
          <StepAction deal={deal} step={step} staffIds={staffIds} />
        )
      ) : null}
    </>
  );
}

function StepAction({
  deal,
  step,
  staffIds,
}: {
  deal: DealView;
  step: DealStepView;
  staffIds?: StaffList;
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
    <div className="mt-4 flex flex-col gap-4">
      {wantsRef ? (
        <div>
          <p className="max-w-[62ch] text-[0.8125rem] leading-relaxed text-muted">
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
        <div className="max-w-sm">
          <label htmlFor={approverId} className={labelClass}>
            Second approval from
          </label>
          <select
            id={approverId}
            value={approvedById}
            onChange={(e) => setApprovedById(e.target.value)}
            className={cn(inputClass, "mt-1.5 cursor-pointer")}
          >
            <option value="">No second approver</option>
            {staffIds?.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
          <p className={hintClass}>
            Required above the platform's threshold. Recorded against your name
            and theirs in the audit trail — only name someone who has actually
            agreed to it.
          </p>
        </div>
      ) : null}

      <div>
        <Button
          type="button"
          size="md"
          className="w-full @sm:w-auto"
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
          <BusyLabel busy={pending} busyText="Saving…">
            <CheckIcon aria-hidden="true" />
            {confirmLabel(step.label)}
          </BusyLabel>
        </Button>

        {blocked ? (
          <p className="mt-2 text-xs text-subtle">
            Add the transaction reference to continue.
          </p>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="mt-2 text-[0.8125rem] font-medium text-danger"
          >
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The whole choreography, in order, with the step in play doing the work.
 *
 * Done steps recede to a tick, who did it and when; the step in play keeps
 * its weight, says whose it is in words as well as colour, and carries its
 * action, so the one button on the screen sits beside the step it completes.
 * Later steps are quiet. No frame of its own: the page puts it in a card.
 */
export function DealSteps({
  deal,
  staffIds,
  payment,
}: {
  deal: DealView;
  /** As for `DealNextStep`: who can second a high-value handover. */
  staffIds?: StaffList;
  /**
   * The buyer's opening payment, drawn in place of the step's own action:
   * the step it completes ticks itself off when the money clears.
   */
  payment?: ReactNode;
}) {
  const total = deal.steps.length;
  const doneCount = deal.steps.filter((s) => s.completedAt !== null).length;
  const percent = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const terminal = isTerminal(deal.status);
  const next = deal.nextStep;
  const state = next ? stepState(deal, next) : null;

  return (
    <section aria-labelledby="steps-heading" className="p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          id="steps-heading"
          className="text-sm leading-6 font-semibold text-fg"
        >
          What happens, in order
        </h2>
        <p className="text-xs text-subtle tabular-nums">
          {doneCount} of {total} done
        </p>
      </div>

      {total > 0 ? (
        <div
          role="progressbar"
          aria-valuenow={doneCount}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label={`${doneCount} of ${total} steps complete`}
          className="mt-3 h-1 w-full overflow-hidden rounded-full bg-surface-3"
        >
          <span
            aria-hidden="true"
            className={cn(
              "block h-full rounded-full transition-[width] duration-500 ease-out",
              deal.status === "COMPLETED"
                ? "bg-verified"
                : terminal
                  ? "bg-line-strong"
                  : "bg-muted",
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : null}

      <ol className="mt-5">
        {deal.steps.map((step, index) => (
          <Step
            key={step.position}
            deal={deal}
            step={step}
            current={
              next?.position === step.position && state ? state : undefined
            }
            isLast={index === deal.steps.length - 1}
            staffIds={staffIds}
            payment={payment}
          />
        ))}
      </ol>
    </section>
  );
}

function Step({
  deal,
  step,
  current,
  isLast,
  staffIds,
  payment,
}: {
  deal: DealView;
  step: DealStepView;
  /** Set on the step in play only. */
  current?: StepState;
  isLast: boolean;
  staffIds?: StaffList;
  payment?: ReactNode;
}) {
  const done = step.completedAt !== null;

  return (
    <li aria-current={current ? "step" : undefined} className="flex gap-3">
      <div className="flex flex-col items-center">
        <Marker done={done} current={current} />
        {!isLast ? (
          <span
            aria-hidden="true"
            className={cn(
              "my-1 w-px flex-1",
              done ? "bg-verified/30" : "bg-line",
            )}
          />
        ) : null}
      </div>

      <div
        className={cn(
          "@container min-w-0 flex-1",
          isLast ? "pb-0" : current ? "pb-7" : "pb-4",
        )}
      >
        {current ? (
          <>
            <p className="text-sm leading-5 font-semibold text-fg">
              {step.label}
            </p>
            <div className="mt-1.5">
              <Whose
                state={current}
                who={actorLabel(step.actor, deal.viewerRole)}
              />
            </div>
            {payment ? (
              <div className="mt-3">{payment}</div>
            ) : (
              <StepDetail
                deal={deal}
                step={step}
                state={current}
                staffIds={staffIds}
              />
            )}
          </>
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            <p
              className={cn(
                "text-sm leading-5",
                done ? "text-muted" : "text-subtle",
              )}
            >
              {step.label}
            </p>
            <p className="text-xs text-subtle">
              {done ? (
                <>
                  Done by {actorLabel(step.actor, deal.viewerRole)} on{" "}
                  {step.completedAt?.toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </>
              ) : (
                <>Then {ACTOR_LABELS[step.actor]}</>
              )}
            </p>
          </div>
        )}

        {step.proofUrl ? (
          <a
            href={step.proofUrl}
            className="mt-0.5 inline-flex min-h-11 items-center text-xs font-medium text-muted underline decoration-line-strong underline-offset-4 transition-colors duration-150 hover:text-fg hover:decoration-current pointer-fine:min-h-6"
          >
            Proof attached
          </a>
        ) : null}
      </div>
    </li>
  );
}

/**
 * The dot on the rail. Done is a quiet tick, the step in play a ring — red
 * while a dispute holds it, and pulsing only when it is the reader's move —
 * and what is still to come an empty circle.
 */
function Marker({ done, current }: { done: boolean; current?: StepState }) {
  if (done) {
    return (
      <span
        aria-hidden="true"
        className="flex size-5 shrink-0 items-center justify-center rounded-full bg-verified-soft text-verified ring-1 ring-verified/25 ring-inset"
      >
        <CheckIcon className="size-3" strokeWidth={3} />
      </span>
    );
  }
  if (current) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full border-2 bg-surface ring-3",
          current.frozen
            ? "border-danger ring-danger-soft"
            : "border-primary ring-primary-soft",
        )}
      >
        <span
          className={cn(
            "size-2 rounded-full",
            current.frozen ? "bg-danger" : "bg-primary",
            current.mine && "animate-pulse-dot",
          )}
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex size-5 shrink-0 items-center justify-center"
    >
      <span className="size-2.5 rounded-full border-[1.5px] border-line-strong bg-surface" />
    </span>
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
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="self-start"
      >
        <ShieldAlertIcon aria-hidden="true" />
        Something is wrong with this deal
      </Button>
    );
  }

  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
        <ShieldAlertIcon
          aria-hidden="true"
          className="size-4 shrink-0 text-subtle"
        />
        <h2 className="text-sm leading-6 font-semibold text-fg">
          Raise this with us
        </h2>
      </div>
      <div className="p-4 sm:p-5">
        <p className="max-w-[62ch] text-[0.8125rem] leading-relaxed text-muted">
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
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
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
            <BusyLabel busy={pending} busyText="Sending…">
              Raise it
            </BusyLabel>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            Never mind
          </Button>
        </div>
        {error ? (
          <p
            role="alert"
            className="mt-2.5 text-[0.8125rem] font-medium text-danger"
          >
            {error}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
