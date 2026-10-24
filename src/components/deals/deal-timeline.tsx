"use client";

import {
  CheckIcon,
  CircleXIcon,
  ClockIcon,
  FastForwardIcon,
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
import { InfoTip } from "@/components/app/info-tip";
import {
  Card,
  Dot,
  hintClass,
  inputClass,
  labelClass,
  Ring,
  TurnFlag,
} from "@/components/app/kit";
import { TextField } from "@/components/auth/fields";
import {
  ACTOR_LABELS,
  actorLabel,
  confirmFirst,
  confirmLabel,
  confirmYes,
  holdNote,
  stepHelp,
  stepTitle,
} from "@/components/deals/deal-status";
import { Button } from "@/components/ui/button";
import { iconText } from "@/components/ui/icon-hue";
import { Price } from "@/components/ui/price";
import { memberMayCancel } from "@/lib/deal-cancel";
import { isTerminal } from "@/lib/deal-machine";
import { cn } from "@/lib/utils";
import { completeStep, endDeal, endWaitNow } from "@/server/actions/deals";
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

type StaffList = { id: string; name: string }[];

/**
 * What the step in play means for this reader: whether it is theirs to do,
 * and what, if anything, stands in the way.
 */
function stepState(deal: DealView, step: DealStepView) {
  // A dispute freezes every step, so the person whose turn it nominally is
  // must not be offered a button the server will refuse.
  const frozen = deal.status === "DISPUTED";
  // The deal's hold — Google's wait, or the holding period: the next step
  // exists, and is not available yet. Offering the button would only
  // produce a refusal.
  const heldUntil =
    deal.holdUntil && new Date(deal.holdUntil) > new Date()
      ? new Date(deal.holdUntil)
      : null;
  // The seller's step that brings our agent in, with no agent yet: there is
  // nobody to invite, and the server refuses the press. It waits on Channel
  // Adda, so it is nobody's move.
  const awaitingAgent = deal.awaitingAgent;
  return {
    frozen,
    heldUntil,
    awaitingAgent,
    mine:
      !frozen && !heldUntil && !awaitingAgent && step.actor === deal.viewerRole,
    help: stepHelp(deal.mode, step.label, deal.platform),
    // Step 1 is completed by the payment clearing and by nothing else, so
    // the buyer gets the payment panel rather than a button the server will
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
  if (state.awaitingAgent) {
    return (
      <span className="text-xs font-medium text-muted">
        Waiting on Channel Adda
      </span>
    );
  }
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

/**
 * Said word for word by the step before the calm pass, now behind the (i)
 * beside its name: the first to whoever is waiting on somebody else, the
 * second to the buyer about to record a payment, under the step's own line
 * that already says what to do.
 */
const NOTHING_FROM_YOU =
  "Nothing is needed from you right now. Your deals list flags this one under “Waiting on you” the moment it is your turn.";

/**
 * The (i) beside the step in play's name.
 *
 * Whoever does the step reads what it involves on the page, because that is
 * what they are about to confirm; only the reasoning behind its form is
 * folded. Everybody else is only watching, so what the step involves and
 * that nothing is needed from them are both one tap away. A paused step
 * keeps its line on the page: the pause is news.
 */
function StepInfo({
  step,
  state,
  className,
}: {
  step: DealStepView;
  state: StepState;
  className?: string;
}) {
  const parts: string[] = [];
  if (!state.mine) {
    if (state.help) parts.push(state.help);
    if (!state.frozen) parts.push(NOTHING_FROM_YOU);
  }
  if (parts.length === 0) return null;

  return (
    <InfoTip label={`About this step: ${step.label}`} className={className}>
      {parts.map((text, index) => (
        <p key={text} className={index > 0 ? "mt-2" : undefined}>
          {text}
        </p>
      ))}
    </InfoTip>
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
  canEndWait,
}: {
  deal: DealView;
  /**
   * Staff who can second a high-value handover. Resolved on the server: the
   * agent has to name somebody, and offering a list beats asking them to
   * paste a user id.
   */
  staffIds?: StaffList;
  /** A moderator or the owner, who may end a waiting period early. */
  canEndWait?: boolean;
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
        <div className="mt-2.5 flex items-start gap-1.5">
          <h2
            id="next-step-heading"
            className="min-w-0 text-[0.9375rem] leading-6 font-semibold text-fg"
          >
            {stepTitle(step.label, deal.viewerRole)}
          </h2>
          <StepInfo step={step} state={state} className="mt-0.5" />
        </div>
        <StepDetail
          deal={deal}
          step={step}
          state={state}
          staffIds={staffIds}
          canEndWait={canEndWait}
        />
      </section>
    </Card>
  );
}

/**
 * Everything under the step in play: what it involves (for the person whose
 * step it is — anyone else finds it behind the (i) by its name), what is in
 * the way, and the button.
 */
function StepDetail({
  deal,
  step,
  state,
  staffIds,
  canEndWait,
}: {
  deal: DealView;
  step: DealStepView;
  state: StepState;
  staffIds?: StaffList;
  canEndWait?: boolean;
}) {
  return (
    <>
      {state.mine && state.help ? (
        <p className="mt-1.5 max-w-[62ch] text-[0.8125rem] leading-relaxed text-muted">
          {state.help}
        </p>
      ) : null}

      {/* The one figure this step is about, so the buyer never has to work
          it out from the deal page: what goes to the seller directly. */}
      {state.mine &&
      deal.mode === "SAFEST" &&
      step.label === "Pay the seller" ? (
        <div className="mt-3 flex max-w-sm items-baseline justify-between gap-3 border-y border-line py-2.5">
          <span className="text-[0.8125rem] text-muted">
            You pay the seller
          </span>
          <Price
            usd={deal.priceUsd / 100}
            className="text-base font-semibold text-fg tabular-nums"
          />
        </div>
      ) : null}

      {state.frozen ? (
        <p className="mt-2 max-w-[62ch] text-[0.8125rem] leading-relaxed text-subtle">
          This step is where the deal stopped. It stays here until a moderator
          decides the dispute.
        </p>
      ) : null}

      {state.heldUntil ? (
        <Note icon={ClockIcon}>
          <span className="font-medium text-fg tabular-nums">
            Opens on{" "}
            {state.heldUntil.toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
            })}
            .
          </span>{" "}
          {holdNote(deal.mode, deal.platform)}
        </Note>
      ) : null}
      {state.heldUntil && canEndWait ? <EndWaitNow orderId={deal.id} /> : null}

      {state.awaitingAgent && step.actor === deal.viewerRole ? (
        <Note icon={ClockIcon}>
          Channel Adda is assigning an agent to this deal. The account to invite
          appears here as soon as they join, and we tell you by email.
        </Note>
      ) : null}

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

/**
 * Staff ending the wait before its date, when Google already lets the
 * transfer go ahead. One press opens a plain check, so it is never done by
 * a stray tap; the next person is told it is their move.
 */
export function EndWaitNow({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        className="mt-3"
      >
        <FastForwardIcon aria-hidden="true" />
        End the wait now
      </Button>
    );
  }

  return (
    <div className="mt-3 max-w-[62ch] rounded-lg border border-line bg-surface p-3 sm:p-3.5">
      <p className="text-[0.8125rem] font-semibold text-fg">
        End the wait now?
      </p>
      <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted">
        Only if Google already lets the transfer go ahead. The next step opens
        straight away and we tell whoever does it.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await endWaitNow(orderId);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setOpen(false);
              router.refresh();
            });
          }}
        >
          <BusyLabel busy={pending} busyText="Ending…">
            Yes, end it now
          </BusyLabel>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => setOpen(false)}
        >
          Keep waiting
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
  );
}

/**
 * A step's button. Its label can be long — "I have made the agent primary
 * owner" — and the chat's side column is narrow, so it wraps inside the
 * button instead of running out of both ends of it.
 */
const STEP_BUTTON =
  "h-auto min-h-11 w-full py-2 text-center whitespace-normal text-balance @sm:w-auto app:pointer-fine:h-auto app:pointer-fine:min-h-9";

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
  const approverId = useId();
  const [approvedById, setApprovedById] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // The presses that decide where the money and the channel go ask once
  // more: Paid, Received, and our agent's custody and transfer.
  const caution = confirmFirst(deal.mode, step.label);
  const [armed, setArmed] = useState(false);
  const label = confirmLabel(step.label);

  const complete = () => {
    setError(null);
    startTransition(async () => {
      const result = await completeStep(deal.id, step.position, {
        ...(approvedById ? { approvedById } : {}),
      });
      if (!result.ok) {
        setError(result.error);
        setArmed(false);
        return;
      }
      router.refresh();
    });
  };

  // Offered whenever the server says this step can need a second signature.
  // The server decides whether it is actually required for this price, so a
  // blank selection is fine below the threshold.
  const wantsApprover = Boolean(staffIds && staffIds.length > 0);

  return (
    <div className="mt-4 flex flex-col gap-4">
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
        {caution && armed ? (
          <div
            role="alertdialog"
            aria-label={`Confirm: ${label}`}
            className="max-w-[62ch] rounded-lg border border-primary/40 bg-primary-soft/60 p-3"
          >
            <p className="text-[0.8125rem] leading-relaxed text-fg">
              {caution}
            </p>
            <div className="mt-3 flex flex-col gap-2 @sm:flex-row @sm:flex-wrap">
              <Button
                type="button"
                size="md"
                className={STEP_BUTTON}
                disabled={pending}
                onClick={complete}
              >
                <BusyLabel busy={pending} busyText="Saving…">
                  <CheckIcon aria-hidden="true" />
                  {confirmYes(step.label)}
                </BusyLabel>
              </Button>
              <Button
                type="button"
                size="md"
                variant="ghost"
                className="w-full @sm:w-auto"
                disabled={pending}
                onClick={() => setArmed(false)}
              >
                Not yet
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            size="md"
            className={STEP_BUTTON}
            disabled={pending}
            onClick={caution ? () => setArmed(true) : complete}
          >
            <BusyLabel busy={pending} busyText="Saving…">
              <CheckIcon aria-hidden="true" />
              {label}
            </BusyLabel>
          </Button>
        )}

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
  canEndWait,
}: {
  deal: DealView;
  /** As for `DealNextStep`: who can second a high-value handover. */
  staffIds?: StaffList;
  /** As for `DealNextStep`: may end a waiting period early. */
  canEndWait?: boolean;
  /**
   * The buyer's opening payment, drawn in place of the step's own action:
   * the step it completes ticks itself off when the money clears.
   */
  payment?: ReactNode;
}) {
  const total = deal.steps.length;
  const doneCount = deal.steps.filter((s) => s.completedAt !== null).length;
  const terminal = isTerminal(deal.status);
  const completed = deal.status === "COMPLETED";
  const next = deal.nextStep;
  const state = next ? stepState(deal, next) : null;
  const progressLabel = `${doneCount} of ${total} steps complete`;

  return (
    <section aria-labelledby="steps-heading" className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-4">
        <h2
          id="steps-heading"
          className="text-sm leading-6 font-semibold text-fg"
        >
          What happens, in order
        </h2>
        {/* How far along, as a figure in a ring rather than a line of text.
            Green once finished; a deal that stopped short keeps its arc in
            the quiet grey of something that is no longer moving (the kit's
            ring has no muted tone, so the arc is recoloured here). */}
        {total > 0 ? (
          <span
            role="progressbar"
            aria-valuenow={doneCount}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-label={progressLabel}
            className={cn(
              "inline-flex shrink-0",
              terminal &&
                !completed &&
                "[&_circle:last-child]:stroke-line-strong",
            )}
          >
            <Ring
              value={doneCount}
              max={total}
              label={progressLabel}
              tone={completed ? "verified" : "neutral"}
              size={40}
            >
              {doneCount}/{total}
            </Ring>
          </span>
        ) : null}
      </div>

      <ol className="mt-4">
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
            canEndWait={canEndWait}
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
  canEndWait,
}: {
  deal: DealView;
  step: DealStepView;
  /** Set on the step in play only. */
  current?: StepState;
  isLast: boolean;
  staffIds?: StaffList;
  payment?: ReactNode;
  canEndWait?: boolean;
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
            <div className="flex items-start gap-1.5">
              <p className="min-w-0 text-sm leading-5 font-semibold text-fg">
                {stepTitle(step.label, deal.viewerRole)}
              </p>
              <StepInfo step={step} state={current} />
            </div>
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
                canEndWait={canEndWait}
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
              {stepTitle(step.label, deal.viewerRole)}
            </p>
            {/* The name already says who does it, so a step still to come
                needs nothing under it; a finished one says when. */}
            {done ? (
              <p className="text-xs text-subtle">
                Done{" "}
                {step.completedAt?.toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                })}
              </p>
            ) : null}
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
          className={`size-4 shrink-0 ${iconText(ShieldAlertIcon)}`}
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

/**
 * The buyer or the seller calling the deal off.
 *
 * Offered only while it will work — before payment, or after it while the
 * seller has pressed nothing (`memberMayCancel`). Later, our agent has
 * access to hand back, and "Something is wrong" is the way out.
 */
export function CancelDeal({ deal }: { deal: DealView }) {
  const router = useRouter();
  const noteId = useId();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (deal.viewerRole !== "buyer" && deal.viewerRole !== "seller") return null;
  if (!memberMayCancel(deal)) return null;

  const unpaid = deal.status === "AWAITING_PAYMENT";
  const outcome = unpaid
    ? "Nothing has been paid, so nothing is owed."
    : deal.viewerRole === "buyer"
      ? "Everything you paid goes back to your Channel Adda balance."
      : "The buyer gets back everything they paid.";

  if (!open) {
    return (
      // Red, because it ends the deal: the owner found it in the same grey
      // as every harmless button.
      <Button
        type="button"
        variant="danger-outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="self-start"
      >
        <CircleXIcon aria-hidden="true" />
        Cancel this deal
      </Button>
    );
  }

  return (
    <Card>
      <div className="p-4 sm:p-5">
        <h2 className="text-sm leading-6 font-semibold text-fg">
          Cancel this deal?
        </h2>
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
          {outcome} The listing goes back on sale.
        </p>
        <TextField
          id={noteId}
          name="note"
          label="Why"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-4 max-w-md"
          required
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={pending || note.trim() === ""}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await endDeal(deal.id, "CANCELLED", note.trim());
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                router.refresh();
              });
            }}
          >
            <BusyLabel busy={pending} busyText="Cancelling…">
              Cancel the deal
            </BusyLabel>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            Keep it
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
