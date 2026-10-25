"use client";

import {
  ArrowRightIcon,
  CheckCircle2Icon,
  MinusIcon,
  PlusIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { BusyLabel, exactUsd } from "@/components/admin/money-parts";
import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  hintClass,
  labelClass,
} from "@/components/app/kit";
import { TextArea, TextField } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { overMaximum } from "@/lib/exact-usd";
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
  maxCents,
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
  /** The largest one correction may be, either way, for anybody. */
  maxCents: number;
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

  // Refused here, before the confirmation: a superadmin was offered
  // "Yes — add $200,000.00" and only then told the limit is $100,000.
  const amountError =
    amount.trim() !== "" && cents === null
      ? "Enter dollars and cents, like 20 or 20.50."
      : cents !== null && cents > maxCents
        ? overMaximum(credit, maxCents)
        : !credit && cents !== null && cents > availableCents
          ? `That is more than their available balance of ${exactUsd(availableCents)}. Money promised to a payout they asked for cannot be taken.`
          : undefined;
  // Past the largest correction there is nothing a superadmin could do
  // either, so the field says so and the finance limit is not raised too.
  const overCap =
    credit &&
    !isSuperadmin &&
    cents !== null &&
    cents > capCents &&
    cents <= maxCents;

  const ready =
    cents !== null &&
    !amountError &&
    !overCap &&
    reasonLength >= minReason &&
    reasonLength <= maxReason;

  const signed = cents === null ? 0 : credit ? cents : -cents;
  const confirming = armed && cents !== null;

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

  // One segment of the add / take switch. The radio itself is visually
  // hidden; its label is the target, and the focus ring follows the radio.
  const choice =
    "flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md px-3 text-[0.8125rem] font-medium transition-[background-color,color,box-shadow] duration-150 select-none pointer-fine:h-[1.875rem] peer-focus-visible:ring-2 peer-focus-visible:ring-ring";
  const chosen = "bg-surface text-fg shadow-xs ring-1 dark:bg-surface-3";
  const notChosen = "text-muted hover:text-fg";

  return (
    <Card>
      <CardHeader
        title="New correction"
        info="Every correction is two ledger rows — one on the member, the opposite one on Channel Adda — so the books still balance, and both go on the audit trail under your name."
      />

      <CardBody className="space-y-5">
        <fieldset aria-describedby={`${ids.legend}-hint`}>
          <legend id={ids.legend} className={labelClass}>
            Which way
          </legend>
          <p id={`${ids.legend}-hint`} className={hintClass}>
            Add when we owe them. Take when they were credited by mistake.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg border border-line bg-surface-2/70 p-0.5 sm:max-w-sm">
            <div className="flex">
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
                  credit ? cn(chosen, "ring-verified/30") : notChosen,
                )}
              >
                <PlusIcon
                  aria-hidden="true"
                  className={cn(
                    "size-4",
                    credit ? "text-verified" : "text-subtle",
                  )}
                />
                Add to balance
              </label>
            </div>
            <div className="flex">
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
                  !credit ? cn(chosen, "ring-danger/30") : notChosen,
                )}
              >
                <MinusIcon
                  aria-hidden="true"
                  className={cn(
                    "size-4",
                    !credit ? "text-danger" : "text-subtle",
                  )}
                />
                Take from balance
              </label>
            </div>
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
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
            className="[&_input]:tabular-nums"
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
                "mt-1.5 text-right text-xs tabular-nums",
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
          <div role="alert">
            <Callout
              tone="danger"
              icon={TriangleAlertIcon}
              title={
                <>
                  Over the {exactUsd(capCents)} finance limit. A superadmin has
                  to make this one.
                </>
              }
            />
          </div>
        ) : null}
      </CardBody>

      {/* The foot of the card is where the action is, and when it is armed
          it becomes the confirmation — tinted by which way the money moves,
          so "take" never looks like "add". */}
      <div
        className={cn(
          "rounded-b-[inherit] border-t px-4 sm:px-5",
          confirming
            ? credit
              ? "border-verified/25 bg-verified-soft/50 py-4"
              : "border-danger/25 bg-danger-soft/50 py-4"
            : "border-line bg-surface-2/50 py-3",
        )}
      >
        {confirming ? (
          <>
            {/* The sentence below says the same in words; this is the
                same before and after, set as figures to be checked at a
                glance. */}
            <div
              aria-hidden="true"
              className="flex flex-wrap items-center gap-x-2.5 gap-y-1 tabular-nums"
            >
              <span className="text-[0.8125rem] font-medium text-muted">
                Balance
              </span>
              <span className="text-[0.8125rem] text-muted">
                {exactUsd(balanceCents)}
              </span>
              <ArrowRightIcon className="size-3.5 text-subtle" />
              <span className="text-lg leading-7 font-semibold tracking-[-0.01em] text-fg">
                {exactUsd(balanceCents + signed)}
              </span>
              <span
                className={cn(
                  "inline-flex h-5 items-center rounded-full px-2 text-xs font-medium ring-1 ring-inset",
                  credit
                    ? "bg-verified-soft text-verified ring-verified/20"
                    : "bg-danger-soft text-danger ring-danger/20",
                )}
              >
                {credit ? "+" : ""}
                {exactUsd(signed)}
              </span>
            </div>

            <p className="mt-2 text-sm leading-relaxed font-medium text-fg">
              {credit ? "Add" : "Take"}{" "}
              <span className="font-semibold tabular-nums">
                {exactUsd(cents)}
              </span>{" "}
              {credit ? "to" : "from"} {memberName}&rsquo;s balance. It goes
              from{" "}
              <span className="tabular-nums">{exactUsd(balanceCents)}</span> to{" "}
              <span className="font-semibold tabular-nums">
                {exactUsd(balanceCents + signed)}
              </span>
              {pendingCents > 0 ? (
                <>
                  , of which{" "}
                  <span className="tabular-nums">{exactUsd(pendingCents)}</span>{" "}
                  stays promised to a payout
                </>
              ) : null}
              .
            </p>
            <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted">
              They will see: &ldquo;{reason.trim().replace(/\s+/g, " ")}&rdquo;
              {/* A reason that ends its own sentence gets no second full stop. */}
              {/[.!?]$/.test(reason.trim()) ? " " : ". "}
              The platform&rsquo;s own side of the books moves by the opposite
              amount, so the ledger still balances. Recorded under your name.
            </p>
            <div className="mt-3.5 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={credit ? "primary" : "danger"}
                disabled={pending}
                onClick={submit}
              >
                <BusyLabel
                  busy={pending}
                  label={`Yes — ${credit ? "add" : "take"} ${exactUsd(cents)}`}
                  busyLabel="Recording…"
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
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
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
              "mt-2.5 flex items-start gap-1.5 text-[0.8125rem] leading-relaxed",
              ok ? "text-verified" : "text-danger",
            )}
          >
            {ok ? (
              <CheckCircle2Icon
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0"
              />
            ) : (
              <TriangleAlertIcon
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0"
              />
            )}
            <span>{message}</span>
          </p>
        ) : null}
      </div>
    </Card>
  );
}
