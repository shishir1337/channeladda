"use client";

import {
  CheckCircle2Icon,
  MinusIcon,
  PlusIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { exactUsd } from "@/components/admin/money-parts";
import { TextArea, TextField } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { adjustMemberBalance } from "@/server/actions/money";

/**
 * Correcting one member's balance.
 *
 * Shaped like the payout control, because it is the same weight of action:
 * money moves on a single press, so the first press only states — in full,
 * to the cent — what is about to happen, and the second does it.
 *
 * Every figure in the confirmation is exact US dollars rather than `Price`:
 * `Price` rounds to whole units in the header currency, and "add $21" on a
 * screen that is about to add $20.50 is how a correction gets corrected.
 *
 * The rules shown here are a courtesy. The server enforces every one of
 * them again, including the ones this form cannot see — the finance cap
 * counts every correction this member received in the last day.
 */

/** The same parse the server does, for the preview only. */
function centsFromText(text: string): number | null {
  const cleaned = text.trim().replace(/^\$/, "").replace(/[,\s]/g, "");
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const cents =
    Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

/**
 * A one-off key for this correction, so a double press or a retried request
 * is recorded once. `getRandomValues` rather than `randomUUID`, which only
 * exists in a secure context.
 */
function newKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function MoneyAdjustForm({
  userId,
  memberName,
  balanceCents,
  availableCents,
  pendingCents,
  capCents,
  capHours,
  minReason,
  maxReason,
  isSuperadmin,
}: {
  userId: string;
  memberName: string;
  balanceCents: number;
  availableCents: number;
  pendingCents: number;
  capCents: number;
  capHours: number;
  minReason: number;
  maxReason: number;
  isSuperadmin: boolean;
}) {
  const router = useRouter();
  const ids = {
    credit: useId(),
    debit: useId(),
    amount: useId(),
    reason: useId(),
    legend: useId(),
  };
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [key, setKey] = useState(newKey);
  const [armed, setArmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  const cents = centsFromText(amount);
  const credit = direction === "credit";
  const reasonLength = reason.trim().replace(/\s+/g, " ").length;

  const amountError =
    amount.trim() !== "" && cents === null
      ? "Enter dollars and cents, like 20 or 20.50."
      : !credit && cents !== null && cents > availableCents
        ? `That is more than their available balance of ${exactUsd(availableCents)}. Money promised to a payout they asked for cannot be taken.`
        : undefined;
  const overCap = credit && !isSuperadmin && cents !== null && cents > capCents;

  const ready =
    cents !== null &&
    !amountError &&
    !overCap &&
    reasonLength >= minReason &&
    reasonLength <= maxReason;

  const signed = cents === null ? 0 : credit ? cents : -cents;

  const submit = () => {
    if (cents === null) return;
    setMessage(null);
    startTransition(async () => {
      const result = await adjustMemberBalance({
        userId,
        direction,
        amount,
        reason,
        key,
      });
      setOk(result.ok);
      setMessage(result.ok ? result.message : result.error);
      setArmed(false);
      if (result.ok) {
        setAmount("");
        setReason("");
        // A fresh key for the next correction; this one is spent.
        setKey(newKey());
        router.refresh();
      }
    });
  };

  const choice =
    "flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring";

  return (
    <div className="rounded-card border border-line bg-surface p-4 sm:p-5">
      <fieldset aria-describedby={`${ids.legend}-hint`}>
        <legend
          id={ids.legend}
          className="font-mono text-[0.625rem] font-semibold tracking-[0.12em] text-subtle uppercase"
        >
          Which way
        </legend>
        <p id={`${ids.legend}-hint`} className="mt-1 text-xs text-subtle">
          Add when we owe them. Take when they were credited by mistake.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <div className="flex min-w-36 flex-1">
            <input
              type="radio"
              id={ids.credit}
              name="direction"
              value="credit"
              checked={credit}
              onChange={() => {
                setDirection("credit");
                setArmed(false);
              }}
              className="peer sr-only"
            />
            <label
              htmlFor={ids.credit}
              className={cn(
                choice,
                credit
                  ? "border-verified/50 bg-verified-soft text-verified"
                  : "border-line bg-surface-2 text-muted hover:border-line-strong hover:text-fg",
              )}
            >
              <PlusIcon aria-hidden="true" className="size-4" />
              Add to balance
            </label>
          </div>
          <div className="flex min-w-36 flex-1">
            <input
              type="radio"
              id={ids.debit}
              name="direction"
              value="debit"
              checked={!credit}
              onChange={() => {
                setDirection("debit");
                setArmed(false);
              }}
              className="peer sr-only"
            />
            <label
              htmlFor={ids.debit}
              className={cn(
                choice,
                !credit
                  ? "border-danger/50 bg-danger-soft text-danger"
                  : "border-line bg-surface-2 text-muted hover:border-line-strong hover:text-fg",
              )}
            >
              <MinusIcon aria-hidden="true" className="size-4" />
              Take from balance
            </label>
          </div>
        </div>
      </fieldset>

      <div className="mt-4 grid gap-4 sm:grid-cols-[12rem_1fr]">
        <TextField
          id={ids.amount}
          name="amount"
          label="Amount in US dollars"
          hint={
            credit
              ? isSuperadmin
                ? "No finance cap applies to you."
                : `Up to ${exactUsd(capCents)} per member in ${capHours} hours.`
              : `Up to ${exactUsd(availableCents)} available.`
          }
          inputMode="decimal"
          autoComplete="off"
          placeholder="20.00"
          value={amount}
          error={amountError}
          onChange={(e) => {
            setAmount(e.target.value);
            setArmed(false);
          }}
          required
        />
        <div>
          <TextArea
            id={ids.reason}
            name="reason"
            label="Reason"
            hint={`The member reads this word for word on their wallet, and it goes on the audit trail. At least ${minReason} characters.`}
            rows={3}
            maxLength={maxReason}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setArmed(false);
            }}
            required
          />
          <p
            className={cn(
              "tnum mt-1.5 text-right text-[0.6875rem]",
              reasonLength > 0 && reasonLength < minReason
                ? "text-primary-text"
                : "text-subtle",
            )}
            aria-live="polite"
          >
            {reasonLength} / {maxReason}
            {reasonLength > 0 && reasonLength < minReason
              ? ` — ${minReason - reasonLength} more needed`
              : ""}
          </p>
        </div>
      </div>

      {overCap ? (
        <p
          role="alert"
          className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-danger"
        >
          <TriangleAlertIcon
            aria-hidden="true"
            className="mt-px size-3.5 shrink-0"
          />
          <span>
            Over the {exactUsd(capCents)} finance limit. A superadmin has to
            make this one.
          </span>
        </p>
      ) : null}

      {armed && cents !== null ? (
        <div
          className={cn(
            "mt-4 rounded-card border p-3.5",
            credit
              ? "border-verified/40 bg-verified-soft"
              : "border-danger/40 bg-danger-soft",
          )}
        >
          <p className="text-sm leading-relaxed font-medium text-fg">
            {credit ? "Add" : "Take"}{" "}
            <span className="tnum font-semibold">{exactUsd(cents)}</span>{" "}
            {credit ? "to" : "from"} {memberName}&rsquo;s balance. It goes from{" "}
            <span className="tnum">{exactUsd(balanceCents)}</span> to{" "}
            <span className="tnum font-semibold">
              {exactUsd(balanceCents + signed)}
            </span>
            {pendingCents > 0 ? (
              <>
                , of which{" "}
                <span className="tnum">{exactUsd(pendingCents)}</span> stays
                promised to a payout
              </>
            ) : null}
            .
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            They will see: &ldquo;{reason.trim().replace(/\s+/g, " ")}&rdquo;.
            The platform&rsquo;s own side of the books moves by the opposite
            amount, so the ledger still balances. Recorded under your name.
          </p>
          <div className="mt-3 flex flex-wrap gap-2.5">
            <Button
              type="button"
              size="sm"
              variant={credit ? "primary" : "danger"}
              disabled={pending}
              onClick={submit}
            >
              {pending
                ? "Recording…"
                : `Yes — ${credit ? "add" : "take"} ${exactUsd(cents)}`}
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
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <Button
            type="button"
            size="sm"
            disabled={!ready || pending}
            onClick={() => {
              setMessage(null);
              setArmed(true);
            }}
          >
            Review the correction
          </Button>
          {!ready && message === null ? (
            <span className="text-xs text-subtle">
              An amount and a reason, then you will be asked to confirm.
            </span>
          ) : null}
        </div>
      )}

      {message ? (
        <p
          role={ok ? "status" : "alert"}
          className={cn(
            "mt-3 flex items-start gap-1.5 text-xs leading-relaxed",
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
      ) : null}
    </div>
  );
}
