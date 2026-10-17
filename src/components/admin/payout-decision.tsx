"use client";

import { CheckCircle2Icon, TriangleAlertIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { TextArea, TextField } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { cn } from "@/lib/utils";
import { decidePayout } from "@/server/actions/wallet";

/**
 * Sending or refusing one payout.
 *
 * Sending requires the transaction hash. That is not bureaucracy: it is the
 * only evidence the money left, and the only thing a seller who says they
 * never received it can be answered with.
 *
 * Settling is the one irreversible action in the product, so it is also the
 * one control that asks twice. The first press states what is about to happen
 * in full — the amount is already on the row above — and the second does it.
 * Refusing needs no second press: it hands the money back to the seller's
 * balance, and they can ask again.
 */
export function PayoutDecision({
  withdrawalId,
  amountCents,
}: {
  withdrawalId: string;
  /** Integer cents, so the confirmation can name the amount it is settling. */
  amountCents?: number;
}) {
  const router = useRouter();
  const ids = { tx: useId(), note: useId() };
  const [txHash, setTxHash] = useState("");
  const [note, setNote] = useState("");
  const [armed, setArmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const [pending, startTransition] = useTransition();

  const decide = (to: "SENT" | "REJECTED") => {
    setMessage(null);
    startTransition(async () => {
      const result = await decidePayout(withdrawalId, to, txHash, note);
      setBad(!result.ok);
      setMessage(result.ok ? result.message : result.error);
      if (result.ok) {
        setArmed(false);
        router.refresh();
      }
    });
  };

  return (
    <div className="mt-4 border-t border-line pt-4">
      <p className="font-mono text-[0.625rem] font-semibold tracking-[0.12em] text-subtle uppercase">
        Settle this payout
      </p>
      <div className="mt-3 grid gap-3.5 sm:grid-cols-2">
        <TextField
          id={ids.tx}
          name="txHash"
          label="Transaction hash"
          hint="Send the funds on-chain first, then paste the hash. Required to mark it sent."
          value={txHash}
          onChange={(e) => setTxHash(e.target.value)}
        />
        <TextArea
          id={ids.note}
          name="note"
          label="Reason, if refusing"
          hint="The seller reads this word for word. Required to refuse."
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {armed ? (
        <div className="mt-3.5 rounded-card border border-danger/40 bg-danger-soft p-3.5">
          <p className="flex items-start gap-2 text-sm leading-relaxed font-medium text-fg">
            <TriangleAlertIcon
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-danger"
            />
            <span>
              Marking{" "}
              {typeof amountCents === "number" ? (
                <Price usd={amountCents / 100} exact className="font-semibold" />
              ) : (
                "this payout"
              )}{" "}
              as sent settles it against the seller&rsquo;s balance for good and
              closes the request. Check the address above against what the
              seller saved. There is no undo.
            </span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2.5">
            <Button
              type="button"
              size="sm"
              variant="danger"
              disabled={pending || txHash.trim() === ""}
              onClick={() => decide("SENT")}
            >
              {pending ? "Settling…" : "Yes — it has been sent"}
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
        <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
          <Button
            type="button"
            size="sm"
            disabled={pending || txHash.trim() === ""}
            onClick={() => {
              setMessage(null);
              setArmed(true);
            }}
          >
            Mark as sent
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending || note.trim() === ""}
            onClick={() => decide("REJECTED")}
          >
            {pending ? "Returning…" : "Refuse and return it"}
          </Button>
          {txHash.trim() === "" && note.trim() === "" ? (
            <span className="text-xs text-subtle">
              A hash to settle it, a reason to refuse it.
            </span>
          ) : null}
        </div>
      )}

      {message ? (
        <p
          role={bad ? "alert" : "status"}
          className={cn(
            "mt-2.5 flex items-start gap-1.5 text-xs leading-relaxed",
            bad ? "text-danger" : "text-verified",
          )}
        >
          {bad ? (
            <TriangleAlertIcon
              aria-hidden="true"
              className="mt-px size-3.5 shrink-0"
            />
          ) : (
            <CheckCircle2Icon
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
