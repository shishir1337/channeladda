"use client";

import {
  CheckCircle2Icon,
  ChevronDownIcon,
  GavelIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { custodyFacts } from "@/components/admin/vocab";
import { TextArea, TextField } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import type { DealMode, OrderStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import {
  assignDealAgent,
  claimDeal,
  endDeal,
  markOpeningPaymentReceived,
} from "@/server/actions/deals";

/**
 * The staff controls on a deal row.
 *
 * These are the levers that move somebody else's money and somebody else's
 * channel, so each one says what it does, in words, and the weight of the
 * control matches the weight of what it does: claiming a deal is a form,
 * recording a payment is a form, and ending a deal is a decision taken behind
 * a disclosure with the consequences written out next to each outcome.
 */

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

/** The frame every control on a row shares, so they stack predictably. */
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
        "mt-3 rounded-card border p-3.5 sm:p-4",
        tone === "danger"
          ? "border-danger/35 bg-danger-soft"
          : "border-line bg-surface-2",
      )}
    >
      <p className="font-mono text-[0.625rem] font-semibold tracking-[0.12em] text-subtle uppercase">
        {title}
      </p>
      {hint ? (
        <p className="mt-1.5 text-xs leading-relaxed text-muted">{hint}</p>
      ) : null}
      {children}
    </div>
  );
}

/** An agent taking the next unheld deal. */
export function ClaimDeal({
  orderId,
  defaultEmail,
  defaultBrand,
}: {
  orderId: string;
  defaultEmail: string;
  defaultBrand: string;
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
          hint="The seller invites this as channel owner."
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <TextField
          id={ids.brand}
          name="agentBrand"
          label="Shown to the seller as"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
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
          {pending ? "Claiming…" : "Take this deal"}
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
          {pending ? "Recording…" : "Payment received"}
        </Button>
        <div className="sm:col-span-3">
          <Outcome message={message} ok={ok} />
        </div>
      </div>
    </ControlBox>
  );
}

/**
 * Staff moving a deal to a different agent.
 *
 * The queue's claim button only covers deals nobody holds. This is the other
 * case: an agent who has been suspended, or has gone quiet, still owns the
 * channel, and somebody has to be able to take it on.
 */
export function AssignAgent({ orderId }: { orderId: string }) {
  const router = useRouter();
  const ids = { agent: useId(), email: useId(), brand: useId() };
  const [agentId, setAgentId] = useState("");
  const [email, setEmail] = useState("");
  const [brand, setBrand] = useState("Channel Adda Transfers");
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <ControlBox
      title="Move it to another agent"
      hint="The new agent is invited as channel owner. Ownership does not move until the seller accepts that invitation, so tell them it is coming."
    >
      <div className="mt-3 grid gap-3 sm:grid-cols-3 sm:items-end">
        <TextField
          id={ids.agent}
          name="agentId"
          label="New agent (user id)"
          hint="From their account page."
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          required
        />
        <TextField
          id={ids.email}
          name="agentEmail"
          label="Google account to invite"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <TextField
          id={ids.brand}
          name="agentBrand"
          label="Shown to the seller as"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
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
        {pending ? "Assigning…" : "Reassign this deal"}
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
    consequence: () =>
      "Ends it with nothing moved and frees the listing. Only reachable while no channel and no payment are in play.",
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
  { label: string; className: string }
> = {
  pause: {
    label: "Reversible",
    className: "border-line bg-surface-2 text-muted",
  },
  final: {
    label: "Irreversible",
    className: "border-danger/30 bg-danger-soft text-danger",
  },
  money: {
    label: "Irreversible · moves money",
    className: "border-danger/30 bg-danger-soft text-danger",
  },
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
 */
export function EndDeal({
  orderId,
  mode,
  status,
}: {
  orderId: string;
  /** Known for every row except reassignment, where the query is SAFEST-only. */
  mode?: DealMode;
  status?: OrderStatus;
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

  const facts = mode && status ? custodyFacts(mode, status) : null;
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
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          aria-controls={ids.panel}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-3.5 text-sm font-medium text-muted transition-colors hover:border-danger/50 hover:text-danger"
        >
          <GavelIcon aria-hidden="true" className="size-4" />
          End or pause this deal
          <ChevronDownIcon aria-hidden="true" className="size-4" />
        </button>
        <Outcome message={message} ok={ok} />
      </div>
    );
  }

  return (
    <div
      id={ids.panel}
      className="mt-3 rounded-card border border-danger/35 bg-danger-soft p-3.5 sm:p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-sm font-bold text-fg">
            End or pause this deal
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Four of these five cannot be undone. Whether one is legal from where
            this deal stands is decided by the transition table, so an outcome
            that is not reachable comes back as a refusal.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setArmed(false);
            setChoice(null);
          }}
          aria-expanded
          aria-controls={ids.panel}
          className="shrink-0 cursor-pointer rounded-lg px-2 py-1 text-xs text-muted underline-offset-4 transition-colors hover:text-fg hover:underline"
        >
          Close
        </button>
      </div>

      {facts ? (
        <dl className="mt-3.5 grid gap-x-5 gap-y-1.5 rounded-xl border border-line bg-surface p-3 text-xs sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="shrink-0 text-subtle">Channel</dt>
            <dd className="min-w-0 text-fg">{facts.asset}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0 text-subtle">Money</dt>
            <dd className="min-w-0 text-fg">{facts.money}</dd>
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <dt className="shrink-0 text-subtle">Recoverable</dt>
            <dd className="min-w-0 font-medium text-fg">{facts.recoverable}</dd>
          </div>
        </dl>
      ) : null}

      <fieldset className="mt-3.5">
        <legend className="font-mono text-[0.625rem] font-semibold tracking-[0.12em] text-subtle uppercase">
          What should happen
        </legend>
        <div className="mt-2 grid gap-2">
          {ENDINGS.map((ending) => {
            const active = choice === ending.to;
            const reachable = ending.applies?.(mode) ?? true;
            const tag = WEIGHT_TAG[ending.weight];
            return (
              <label
                key={ending.to}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-xl border bg-surface p-3 transition-colors",
                  active
                    ? "border-primary bg-primary-soft"
                    : "border-line hover:border-line-strong",
                )}
              >
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
                  className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
                />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-fg">
                      {ending.label}
                    </span>
                    <span
                      className={cn(
                        "rounded-full border px-1.5 py-0.5 text-[0.625rem] font-semibold whitespace-nowrap",
                        tag.className,
                      )}
                    >
                      {tag.label}
                    </span>
                    {!reachable ? (
                      <span className="rounded-full border border-line bg-surface-2 px-1.5 py-0.5 text-[0.625rem] font-semibold whitespace-nowrap text-subtle">
                        Not this mode
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted">
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
        className="mt-3.5"
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
          {pending ? "Pausing…" : "Pause it for review"}
        </Button>
      ) : armed ? (
        <div className="mt-3 rounded-xl border border-danger/40 bg-surface p-3">
          <p className="flex items-start gap-2 text-xs leading-relaxed font-medium text-fg">
            <TriangleAlertIcon
              aria-hidden="true"
              className="mt-px size-4 shrink-0 text-danger"
            />
            <span>
              {selected.label}. {selected.consequence(mode)} There is no undo.
            </span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2.5">
            <Button
              type="button"
              size="sm"
              variant="danger"
              disabled={pending || !ready}
              onClick={() => run(selected.to)}
            >
              {pending ? "Working…" : `Yes — ${selected.label.toLowerCase()}`}
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
