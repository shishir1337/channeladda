"use client";

import {
  CheckCircle2Icon,
  ChevronDownIcon,
  GavelIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type ComponentProps, useId, useState, useTransition } from "react";
import { custodyFacts } from "@/components/admin/vocab";
import { InfoTip } from "@/components/app/info-tip";
import { inputClass, labelClass } from "@/components/app/kit";
import { TextArea, TextField } from "@/components/auth/fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DealMode, OrderStatus } from "@/generated/prisma/enums";
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

/**
 * Fields the server fills from a stored identity are shown read-only, and
 * look it: a well rather than a white input, so nobody tries to edit them.
 */
const lockedField =
  "[&_input]:cursor-default [&_input]:bg-surface-2 [&_input]:text-muted [&_input]:shadow-none";

/** An agent taking the next unheld deal. */
export function ClaimDeal({
  orderId,
  defaultEmail,
  defaultBrand,
  locked = false,
}: {
  orderId: string;
  defaultEmail: string;
  defaultBrand: string;
  /**
   * The agent has a stored identity, set by a superadmin on their member
   * page. The server uses it whatever is typed, so the fields are shown
   * read-only rather than offering an edit that would be silently ignored.
   */
  locked?: boolean;
}) {
  const router = useRouter();
  const ids = { email: useId(), brand: useId() };
  const [email, setEmail] = useState(defaultEmail);
  const [brand, setBrand] = useState(defaultBrand);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <ControlBox
      title="Take this deal"
      hint="You become the agent of record. On a Safest deal that means you personally own the channel until you transfer it on."
    >
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <TextField
          id={ids.email}
          name="agentEmail"
          label="Google account to invite"
          hint={
            locked
              ? "Your transfer identity, set by a superadmin."
              : "The seller invites this as channel owner."
          }
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          readOnly={locked}
          className={locked ? lockedField : undefined}
          required
        />
        <TextField
          id={ids.brand}
          name="agentBrand"
          label="Shown to the seller as"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          readOnly={locked}
          className={locked ? lockedField : undefined}
          required
        />
        <Button
          type="button"
          size="md"
          disabled={pending || !email.trim() || !brand.trim()}
          onClick={() => {
            setMessage(null);
            startTransition(async () => {
              const result = await claimDeal(
                orderId,
                email.trim(),
                brand.trim(),
              );
              setOk(result.ok);
              setMessage(result.ok ? result.message : result.error);
              if (result.ok) router.refresh();
            });
          }}
        >
          <SteadyLabel
            pending={pending}
            idle="Take this deal"
            busy="Claiming…"
          />
        </Button>
        <div className="sm:col-span-3">
          <Outcome message={message} ok={ok} />
        </div>
      </div>
    </ControlBox>
  );
}

/**
 * Recording the opening payment by hand.
 *
 * Stands in for the Cryptomus webhook. Every later step of a deal unlocks
 * behind this, so it is the one control on this page that staff will use on
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
  const ids = { agent: useId(), email: useId(), brand: useId() };
  const [agentId, setAgentId] = useState("");
  const [email, setEmail] = useState("");
  const [brand, setBrand] = useState("Channel Adda Transfers");
  const chosen = agents.find((agent) => agent.id === agentId);
  const locked = Boolean(chosen?.agentEmail && chosen.agentBrand);
  const choices = agents.filter((agent) => agent.id !== currentAgentId);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <ControlBox
      title="Move it to another agent"
      hint="The new agent is invited as channel owner. Ownership does not move until the seller accepts that invitation, so tell them it is coming."
    >
      {choices.length === 0 ? (
        <p className="mt-2 text-[0.8125rem] text-muted">
          There is no other active agent to give it to. Invite one from the Team
          page first.
        </p>
      ) : null}
      <div className="mt-3 grid gap-3 sm:grid-cols-3 sm:items-end">
        <div>
          <label htmlFor={ids.agent} className={labelClass}>
            New agent
            <span className="ml-0.5 text-danger">*</span>
          </label>
          <div className="relative mt-1.5">
            <select
              id={ids.agent}
              name="agentId"
              value={agentId}
              required
              onChange={(e) => {
                const next = agents.find((a) => a.id === e.target.value);
                setAgentId(e.target.value);
                // Their stored identity is what the server will use, so the
                // fields show it; without one, they start empty to be typed.
                setEmail(next?.agentEmail ?? "");
                setBrand(next?.agentBrand ?? "Channel Adda Transfers");
              }}
              className={cn(inputClass, "cursor-pointer appearance-none pr-9")}
            >
              <option value="">Choose an agent…</option>
              {choices.map((agent) => (
                <option key={agent.id} value={agent.id} disabled={agent.atCap}>
                  {agent.name} — holding {agent.holds}
                  {agent.atCap ? " (at their limit)" : ""}
                </option>
              ))}
            </select>
            <ChevronDownIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-subtle"
            />
          </div>
        </div>
        <TextField
          id={ids.email}
          name="agentEmail"
          label="Google account to invite"
          hint={locked ? "Their stored identity." : undefined}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          readOnly={locked}
          className={locked ? lockedField : undefined}
          required
        />
        <TextField
          id={ids.brand}
          name="agentBrand"
          label="Shown to the seller as"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          readOnly={locked}
          className={locked ? lockedField : undefined}
          required
        />
      </div>
      <Button
        type="button"
        size="sm"
        className="mt-3"
        disabled={pending || !agentId.trim() || !email.trim()}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            const result = await assignDealAgent(
              orderId,
              agentId.trim(),
              email.trim(),
              brand.trim(),
            );
            setOk(result.ok);
            setMessage(result.ok ? result.message : result.error);
            if (result.ok) router.refresh();
          });
        }}
      >
        <SteadyLabel
          pending={pending}
          idle="Reassign this deal"
          busy="Assigning…"
        />
      </Button>
      <Outcome message={message} ok={ok} />
    </ControlBox>
  );
}

type EndingTo =
  | "DISPUTED"
  | "RETURNED_TO_SELLER"
  | "REFUNDED"
  | "CANCELLED"
  | "COMPLETED";

type Ending = {
  to: EndingTo;
  label: string;
  /** Plain words for what happens to the channel and to the money. */
  consequence: (mode?: DealMode) => string;
  /** How it is worth treating: a pause, something final, or a payout. */
  weight: "pause" | "final" | "money";
  /** False when this mode cannot reach it at all — still offered, see below. */
  applies?: (mode?: DealMode) => boolean;
};

/**
 * Pausing comes first because it is the way into the other four on a deal that
 * is still running: finishing one is the last step's job, and `resolveDeal`
 * only decides a deal that is actually in dispute.
 *
 * Which endings are legal from here is decided by the transition table, not by
 * this list, so an illegal one comes back as a refusal rather than being
 * hidden — staff get told why instead of wondering where a button went. What
 * this list does add is the warning before the refusal: an outcome the mode
 * can never reach is marked as such, with the reason, so the refusal is not a
 * surprise.
 */
const ENDINGS: readonly Ending[] = [
  {
    to: "DISPUTED",
    label: "Pause it for review",
    weight: "pause",
    consequence: () =>
      "Freezes the deal and marks it disputed. Nothing moves until a moderator decides it, and all four outcomes below stay open. Reversible in the sense that it decides nothing.",
  },
  {
    to: "RETURNED_TO_SELLER",
    label: "Return the channel to the seller",
    weight: "final",
    applies: (mode) => mode !== "FASTEST",
    consequence: (mode) =>
      mode === "FASTEST"
        ? "Safest only. On a Fastest deal the agent never owns the channel, so there is nothing to hand back."
        : "The agent gives ownership back to the seller. The buyer ends up with no channel. The admin fee is not returned by this.",
  },
  {
    to: "REFUNDED",
    label: "Refund the buyer",
    weight: "money",
    applies: (mode) => mode !== "SAFEST",
    consequence: (mode) =>
      mode === "SAFEST"
        ? "Fastest only. On a Safest deal the price went straight from buyer to seller and we never held it, so there is no price here to refund."
        : "Returns the price and the fee we are holding to the buyer. The seller is paid nothing.",
  },
  {
    to: "CANCELLED",
    label: "Cancel the deal",
    weight: "final",
    consequence: (mode) =>
      mode === "FASTEST"
        ? "Ends it and frees the listing. If the buyer has paid, everything we are holding — price and fee — goes back to their balance."
        : mode === "SAFEST"
          ? "Ends it and frees the listing. Before our agent holds the channel, the admin fee goes back to the buyer. Once the agent holds it, this is refused — return the channel instead."
          : "Ends it and frees the listing, returning whatever we are holding for the buyer.",
  },
  {
    to: "COMPLETED",
    label: "Decide it in the seller's favour",
    weight: "money",
    consequence: (mode) =>
      mode === "FASTEST"
        ? "Marks the deal complete and credits the seller's wallet with the money we are holding. This pays out."
        : mode === "SAFEST"
          ? "Marks the deal complete as it stands. The buyer paid the seller directly, so no money moves here."
          : "Marks the deal complete. On a Fastest deal this also credits the seller's wallet with the money we are holding.",
  },
];

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
}: {
  orderId: string;
  /** Whether the opening payment cleared. Needed to describe a dispute. */
  paid?: boolean;
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
              Four of these five cannot be undone.
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
          {ENDINGS.filter(
            // A disputed deal is already paused; offering it again only
            // produced a refusal.
            (ending) => !(ending.to === "DISPUTED" && status === "DISPUTED"),
          ).map((ending) => {
            const active = choice === ending.to;
            const reachable = ending.applies?.(mode) ?? true;
            const tag = WEIGHT_TAG[ending.weight];
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
                      <Badge variant="neutral">Not this mode</Badge>
                    ) : null}
                    {!canMoveMoney &&
                    (ending.weight === "money" ||
                      (ending.to === "CANCELLED" &&
                        mode === "FASTEST" &&
                        paid === true)) ? (
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
