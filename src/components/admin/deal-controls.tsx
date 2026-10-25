"use client";

import {
  CheckCircle2Icon,
  ChevronDownIcon,
  GavelIcon,
  TriangleAlertIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ComponentProps, useId, useState, useTransition } from "react";
import { custodyFacts } from "@/components/admin/vocab";
import { InfoTip } from "@/components/app/info-tip";
import { inputClass, labelClass } from "@/components/app/kit";
import { TextArea, TextField } from "@/components/auth/fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DealMode, OrderStatus } from "@/generated/prisma/enums";
import { levelLabel } from "@/lib/custody-roles";
import {
  ENDINGS,
  type Ending,
  type EndingTo,
  MAX_DEAL_NOTE,
  undoLine,
} from "@/lib/deal-endings";
import { movesHeldMoney } from "@/lib/outcomes";
import { cn } from "@/lib/utils";
import {
  assignDealAgent,
  claimDeal,
  endDeal,
  markOpeningPaymentReceived,
} from "@/server/actions/deals";
import { checkInvoiceNow } from "@/server/actions/money";
import type { AssignableAgent } from "@/server/admin-users";

/**
 * The staff controls on a deal row.
 *
 * These are the levers that move somebody else's money and somebody else's
 * channel, so each one says what it does, in words, and the weight of the
 * control matches the weight of what it does: claiming a deal is a form,
 * recording a payment is a form, and ending a deal is a decision taken behind
 * a disclosure with the consequences written out next to each outcome.
 */

/**
 * A button label that keeps its width while the busy text shows.
 *
 * Both labels sit in one grid cell and the wider of the two holds the size,
 * so a button does not jump narrower under the pointer the moment it is
 * pressed. Only the visible one is read out.
 */
export function SteadyLabel({
  pending,
  idle,
  busy,
}: {
  pending: boolean;
  idle: string;
  busy: string;
}) {
  return (
    <span className="inline-grid justify-items-center">
      <span
        aria-hidden="true"
        className="invisible col-start-1 row-start-1 whitespace-nowrap"
      >
        {idle.length >= busy.length ? idle : busy}
      </span>
      <span className="col-start-1 row-start-1 whitespace-nowrap">
        {pending ? busy : idle}
      </span>
    </span>
  );
}

function Outcome({ message, ok }: { message: string | null; ok: boolean }) {
  if (!message) return null;
  return (
    <p
      role={ok ? "status" : "alert"}
      className={cn(
        "mt-2.5 flex items-start gap-1.5 text-xs leading-relaxed",
        ok ? "text-verified" : "text-danger",
      )}
    >
      {ok ? (
        <CheckCircle2Icon
          aria-hidden="true"
          className="mt-px size-3.5 shrink-0"
        />
      ) : (
        <TriangleAlertIcon
          aria-hidden="true"
          className="mt-px size-3.5 shrink-0"
        />
      )}
      <span>{message}</span>
    </p>
  );
}

/**
 * The frame every control on a row shares, so they stack predictably.
 *
 * A well, not a card: it sits inside a row or a case that already has the
 * border, and cards never nest.
 */
function ControlBox({
  title,
  hint,
  tone = "neutral",
  children,
}: {
  title: string;
  hint?: string;
  tone?: "neutral" | "danger";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mt-3 rounded-lg border p-3 sm:p-3.5",
        tone === "danger"
          ? "border-danger/25 bg-danger-soft/40"
          : "border-line bg-surface-2/50",
      )}
    >
      <p className="text-[0.8125rem] leading-5 font-medium text-fg">{title}</p>
      {hint ? (
        <p className="mt-0.5 max-w-[72ch] text-xs leading-relaxed text-muted">
          {hint}
        </p>
      ) : null}
      {children}
    </div>
  );
}

/** An agent taking the next unheld deal. */
export function ClaimDeal({
  orderId,
  identity,
}: {
  orderId: string;
  /**
   * The agent's transfer identity: the account sellers hand the deal to,
   * and the name it shows up as. Without one there is nothing to claim
   * with — a sign-in email is never shown to a seller in its place.
   */
  identity: { email: string; brand: string } | null;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!identity) {
    return (
      <ControlBox
        title="Take this deal"
        hint="Sellers hand the deal to your transfer identity — the account they invite, and the name it shows as. You have not set one yet."
      >
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-muted">
          Set it under Your deal desk on your{" "}
          <Link
            href="/dashboard/security"
            className="font-medium text-fg underline underline-offset-4"
          >
            Security page
          </Link>
          , then come back to take this deal.
        </p>
      </ControlBox>
    );
  }

  return (
    <ControlBox
      title="Take this deal"
      hint="You become the agent of record. The seller hands the deal to your transfer identity, and you hold it until you hand it on to the buyer."
    >
      <IdentityLines identity={identity} />
      <Button
        type="button"
        size="md"
        className="mt-3"
        disabled={pending}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            const result = await claimDeal(orderId);
            setOk(result.ok);
            setMessage(result.ok ? result.message : result.error);
            if (result.ok) router.refresh();
          });
        }}
      >
        <SteadyLabel pending={pending} idle="Take this deal" busy="Claiming…" />
      </Button>
      <Outcome message={message} ok={ok} />
    </ControlBox>
  );
}

/** Who sellers hand the deal to, and the name it shows as. */
function IdentityLines({
  identity,
}: {
  identity: { email: string; brand: string };
}) {
  return (
    <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-xs leading-relaxed sm:grid-cols-2">
      <div className="flex min-w-0 gap-2">
        <dt className="shrink-0 text-subtle">Sellers hand it to</dt>
        <dd className="min-w-0 font-mono break-all text-fg">
          {identity.email}
        </dd>
      </div>
      <div className="flex min-w-0 gap-2">
        <dt className="shrink-0 text-subtle">Shown as</dt>
        <dd className="min-w-0 text-fg">{identity.brand}</dd>
      </div>
    </dl>
  );
}

/**
 * Recording the opening payment by hand.
 *
 * Stands in for the Cryptomus webhook. Every later step of a deal unlocks
 * behind it, so it is the one control on this page that staff will use on
 * every single deal until payments are wired.
 *
 * A secondary button, not the gold one: the processor's callback is the
 * expected way a payment clears, and this is the exception to it.
 */
export function RecordPayment({ orderId }: { orderId: string }) {
  const router = useRouter();
  const ids = { ref: useId(), asset: useId() };
  const [ref, setRef] = useState("");
  const [asset, setAsset] = useState("USDT");
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <ControlBox
      title="Record the payment by hand"
      hint="Only when the money reached us some other way. Recording the same reference twice is harmless; recording one that never arrived unlocks the rest of the deal."
    >
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
        <TextField
          id={ids.ref}
          name="paymentRef"
          label="Payment reference"
          hint="From the processor."
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          required
        />
        <TextField
          id={ids.asset}
          name="paymentAsset"
          label="Asset"
          value={asset}
          onChange={(e) => setAsset(e.target.value)}
          required
        />
        <Button
          type="button"
          size="md"
          variant="secondary"
          disabled={pending || !ref.trim()}
          onClick={() => {
            setMessage(null);
            startTransition(async () => {
              const result = await markOpeningPaymentReceived(
                orderId,
                ref.trim(),
                asset.trim(),
              );
              setOk(result.ok);
              setMessage(result.ok ? result.message : result.error);
              if (result.ok) router.refresh();
            });
          }}
        >
          <SteadyLabel
            pending={pending}
            idle="Payment received"
            busy="Recording…"
          />
        </Button>
        <div className="sm:col-span-3">
          <Outcome message={message} ok={ok} />
        </div>
      </div>
    </ControlBox>
  );
}

/** Asking the processor about this deal's invoice instead of waiting. */
export function CheckInvoice({ reference }: { reference: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-3">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            const result = await checkInvoiceNow(reference);
            setOk(result.ok);
            setMessage(result.ok ? result.message : result.error);
            if (result.ok) router.refresh();
          });
        }}
      >
        <SteadyLabel
          pending={pending}
          idle="Check with Cryptomus now"
          busy="Asking Cryptomus…"
        />
      </Button>
      <Outcome message={message} ok={ok} />
    </div>
  );
}

/**
 * Staff moving a deal to a different agent.
 *
 * The queue's claim button only covers deals nobody holds. This is the other
 * case: an agent who has been suspended, or has gone quiet, still owns the
 * channel, and somebody has to be able to take it on.
 */
export function AssignAgent({
  orderId,
  agents,
  currentAgentId,
}: {
  orderId: string;
  agents: readonly AssignableAgent[];
  currentAgentId?: string | null;
}) {
  const router = useRouter();
  const ids = { agent: useId() };
  const [agentId, setAgentId] = useState("");
  const chosen = agents.find((agent) => agent.id === agentId);
  // A deal goes only to someone sellers can hand it to: their stored
  // transfer identity. Nobody's sign-in email stands in for one.
  const identity =
    chosen?.agentEmail && chosen.agentBrand
      ? { email: chosen.agentEmail, brand: chosen.agentBrand }
      : null;
  const choices = agents.filter((agent) => agent.id !== currentAgentId);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();
  // The same control hands out a deal nobody holds and moves one somebody
  // can no longer act on; only the words differ.
  const fresh = currentAgentId === null || currentAgentId === undefined;

  return (
    <ControlBox
      title={fresh ? "Give it to someone" : "Move it to another agent"}
      hint={
        fresh
          ? "Only people whose level covers this deal's price are listed. The seller is told who to hand it to as soon as it is assigned."
          : "The seller hands it to the new agent instead. Nothing moves until they do, so tell them it is coming."
      }
    >
      {choices.length === 0 ? (
        <p className="mt-2 text-[0.8125rem] text-muted">
          Nobody whose level covers this deal is free to take it. Set levels, or
          invite somebody, from the{" "}
          <Link
            href="/admin/team"
            className="font-medium text-fg underline underline-offset-4"
          >
            Team page
          </Link>
          .
        </p>
      ) : null}
      <div className="mt-3 max-w-md">
        <label htmlFor={ids.agent} className={labelClass}>
          {fresh ? "Runs the deal" : "New agent"}
          <span className="ml-0.5 text-danger">*</span>
        </label>
        <div className="relative mt-1.5">
          <select
            id={ids.agent}
            name="agentId"
            value={agentId}
            required
            onChange={(e) => setAgentId(e.target.value)}
            className={cn(inputClass, "cursor-pointer appearance-none pr-9")}
          >
            <option value="">Choose who runs it…</option>
            {choices.map((agent) => (
              <option key={agent.id} value={agent.id} disabled={agent.atCap}>
                {agent.name} · {levelLabel(agent.dealLevel)} — holding{" "}
                {agent.holds}
                {agent.atCap ? " (at their limit)" : ""}
                {agent.agentEmail && agent.agentBrand
                  ? ""
                  : " (no transfer identity)"}
              </option>
            ))}
          </select>
          <ChevronDownIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-subtle"
          />
        </div>
      </div>
      {chosen && identity ? (
        <IdentityLines identity={identity} />
      ) : chosen ? (
        <p className="mt-3 text-[0.8125rem] leading-relaxed text-danger">
          {chosen.name} has no transfer identity yet — the account sellers hand
          deals to. Set it on{" "}
          <Link
            href={`/admin/users/${chosen.id}`}
            className="font-medium underline underline-offset-4"
          >
            their Team page
          </Link>{" "}
          first.
        </p>
      ) : null}
      <Button
        type="button"
        size="sm"
        className="mt-3"
        disabled={pending || !chosen || !identity}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            const result = await assignDealAgent(orderId, agentId.trim());
            setOk(result.ok);
            setMessage(result.ok ? result.message : result.error);
            if (result.ok) router.refresh();
          });
        }}
      >
        <SteadyLabel
          pending={pending}
          idle={fresh ? "Assign this deal" : "Reassign this deal"}
          busy="Assigning…"
        />
      </Button>
      <Outcome message={message} ok={ok} />
    </ControlBox>
  );
}

const WEIGHT_TAG: Record<
  Ending["weight"],
  { label: string; variant: ComponentProps<typeof Badge>["variant"] }
> = {
  pause: { label: "Reversible", variant: "neutral" },
  final: { label: "Irreversible", variant: "danger" },
  money: { label: "Irreversible · moves money", variant: "danger" },
};

/**
 * Ending a deal some other way.
 *
 * Five outcomes that are nothing like each other used to sit in one row of
 * identical secondary buttons: pausing a deal for review and paying a seller
 * out of escrow looked the same and were one mis-aimed tap apart. Now the
 * whole thing is behind a disclosure, the outcome is chosen deliberately, the
 * consequence for *this* deal's mode is spelled out, and anything final needs
 * a second confirmation. The note is still required, because it is what the
 * audit trail will carry.
 *
 * The closed control is deliberately quiet — an outline button that only
 * turns red under the pointer — so on a row whose real next step is a claim
 * or a reassignment, the gold button stays the loud one.
 */
export function EndDeal({
  orderId,
  mode,
  status,
  canMoveMoney = false,
  paid,
  inCustody,
  pricePaid,
}: {
  orderId: string;
  /** Whether the opening payment cleared. Needed to describe a dispute. */
  paid?: boolean;
  /**
   * Safest: whether the buyer has pressed Paid. Until they have, finishing
   * the deal would hand them the channel for the fee alone, so the server
   * refuses it and this says so first.
   */
  pricePaid?: boolean;
  /** Whether a Safest agent took the channel. Needed to describe a dispute. */
  inCustody?: boolean;
  /** Known for every row except reassignment, where the query is SAFEST-only. */
  mode?: DealMode;
  status?: OrderStatus;
  /**
   * FINANCE or SUPERADMIN. The two outcomes that pay somebody out of money
   * the platform holds are theirs; the server refuses anyone else, and this
   * says so before the click rather than after it.
   */
  canMoveMoney?: boolean;
}) {
  const router = useRouter();
  const ids = { note: useId(), panel: useId(), group: useId() };
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<EndingTo | null>(null);
  const [armed, setArmed] = useState(false);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  const facts =
    mode && status
      ? custodyFacts(
          mode,
          status,
          paid === undefined && inCustody === undefined
            ? undefined
            : { paid, inCustody },
        )
      : null;
  const selected = ENDINGS.find((e) => e.to === choice) ?? null;
  // A disputed deal is already paused; offering it again only produced a
  // refusal.
  const shown = ENDINGS.filter(
    (ending) => !(ending.to === "DISPUTED" && status === "DISPUTED"),
  );
  const ready = selected !== null && note.trim() !== "";

  function run(to: EndingTo) {
    setMessage(null);
    startTransition(async () => {
      const result = await endDeal(orderId, to, note.trim());
      setOk(result.ok);
      setMessage(result.ok ? result.message : result.error);
      if (result.ok) {
        setArmed(false);
        setChoice(null);
        setNote("");
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <div className="mt-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          aria-controls={ids.panel}
          className="text-muted hover:border-danger/40 hover:bg-danger-soft/40 hover:text-danger app:hover:border-danger/40"
        >
          <GavelIcon aria-hidden="true" />
          End or pause this deal
          <ChevronDownIcon aria-hidden="true" />
        </Button>
        <Outcome message={message} ok={ok} />
      </div>
    );
  }

  return (
    <div
      id={ids.panel}
      className="mt-3 rounded-lg border border-danger/30 bg-surface p-3 shadow-xs sm:p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <GavelIcon
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-danger"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm leading-5 font-semibold text-fg">
                End or pause this deal
              </p>
              <InfoTip label="About ending a deal">
                Whether one is legal from where this deal stands is decided by
                the transition table, so an outcome that is not reachable comes
                back as a refusal.
              </InfoTip>
            </div>
            {/* What cannot be undone stays on the panel; only the why of a
                refusal is behind the (i). */}
            <p className="mt-0.5 max-w-[72ch] text-xs leading-relaxed text-muted">
              {undoLine(shown)}
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setArmed(false);
            setChoice(null);
          }}
          aria-expanded
          aria-controls={ids.panel}
          className="-mt-1 -mr-1 shrink-0"
        >
          Close
        </Button>
      </div>

      {facts ? (
        <dl className="mt-3 grid gap-x-6 gap-y-1.5 rounded-lg border border-line bg-surface-2/50 px-3 py-2.5 text-xs leading-relaxed sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="w-[4.75rem] shrink-0 text-subtle sm:w-auto">
              Channel
            </dt>
            <dd className="min-w-0 text-fg">{facts.asset}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-[4.75rem] shrink-0 text-subtle sm:w-auto">
              Money
            </dt>
            <dd className="min-w-0 text-fg">{facts.money}</dd>
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <dt className="w-[4.75rem] shrink-0 text-subtle sm:w-auto">
              Recoverable
            </dt>
            <dd className="min-w-0 font-medium text-fg">{facts.recoverable}</dd>
          </div>
        </dl>
      ) : null}

      <fieldset className="mt-4">
        <legend className="text-xs font-medium text-muted">
          What should happen
        </legend>
        <div className="mt-2 divide-y divide-line overflow-hidden rounded-lg border border-line">
          {shown.map((ending) => {
            const active = choice === ending.to;
            const priceMissing =
              ending.to === "COMPLETED" &&
              mode === "SAFEST" &&
              pricePaid === false;
            const reachable = (ending.applies?.(mode) ?? true) && !priceMissing;
            // The server's rule: handing held money back is a refund
            // whatever it is called, in either mode.
            const movesMoney = movesHeldMoney(ending.to, paid === true);
            const tag =
              movesMoney && ending.weight === "final"
                ? WEIGHT_TAG.money
                : WEIGHT_TAG[ending.weight];
            return (
              <label
                key={ending.to}
                className={cn(
                  "relative flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors duration-150 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
                  active
                    ? "bg-primary-soft/50"
                    : "bg-surface hover:bg-surface-2/60",
                )}
              >
                {active ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 w-0.5 bg-primary"
                  />
                ) : null}
                <input
                  type="radio"
                  name={ids.group}
                  value={ending.to}
                  checked={active}
                  disabled={pending}
                  onChange={() => {
                    setChoice(ending.to);
                    setArmed(false);
                    setMessage(null);
                  }}
                  className="mt-0.5 size-4 shrink-0 cursor-[inherit] accent-[var(--color-primary)]"
                />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[0.8125rem] leading-5 font-medium text-fg">
                      {ending.label}
                    </span>
                    <Badge variant={tag.variant}>{tag.label}</Badge>
                    {!reachable ? (
                      <Badge variant="neutral">
                        {priceMissing ? "Price not paid yet" : "Not this mode"}
                      </Badge>
                    ) : null}
                    {!canMoveMoney &&
                    (ending.weight === "money" || movesMoney) ? (
                      <Badge variant="neutral">Finance only</Badge>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                    {ending.consequence(mode)}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <TextArea
        id={ids.note}
        name="note"
        label="Why"
        hint="Goes in the audit trail under your name, and cannot be edited afterwards. This is what a dispute is settled from."
        rows={2}
        maxLength={MAX_DEAL_NOTE}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="mt-4"
        required
      />

      {selected === null ? (
        <p className="mt-3 text-xs text-subtle">
          Choose an outcome above to go on.
        </p>
      ) : selected.weight === "pause" ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="mt-3"
          disabled={pending || !ready}
          onClick={() => run(selected.to)}
        >
          <SteadyLabel
            pending={pending}
            idle="Pause it for review"
            busy="Pausing…"
          />
        </Button>
      ) : armed ? (
        <div className="mt-3 rounded-lg border border-danger/30 bg-danger-soft/60 p-3">
          <p className="flex items-start gap-2 text-xs leading-relaxed font-medium text-fg">
            <TriangleAlertIcon
              aria-hidden="true"
              className="mt-px size-4 shrink-0 text-danger"
            />
            <span>
              {selected.label}. {selected.consequence(mode)} There is no undo.
            </span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2 pl-6">
            <Button
              type="button"
              size="sm"
              variant="danger"
              disabled={pending || !ready}
              onClick={() => run(selected.to)}
            >
              <SteadyLabel
                pending={pending}
                idle={`Yes — ${selected.label.toLowerCase()}`}
                busy="Working…"
              />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => setArmed(false)}
            >
              Back
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending || !ready}
            onClick={() => setArmed(true)}
          >
            Continue
          </Button>
          {note.trim() === "" ? (
            <span className="text-xs text-subtle">
              The note is required first.
            </span>
          ) : null}
        </div>
      )}

      <Outcome message={message} ok={ok} />
    </div>
  );
}
