"use client";

import { CheckCircle2Icon, TriangleAlertIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { BusyLabel } from "@/components/admin/money-parts";
import { TextArea, TextField } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { checkTxHash } from "@/lib/payout-address";
import { cn } from "@/lib/utils";
import { decidePayout } from "@/server/actions/wallet";

/**
 * Sending or refusing one payout.
 *
 * Sending requires the transaction hash, in the payout network's own format
 * — "abc" used to settle one. That is not bureaucracy: it is the only
 * evidence the money left, and the only thing a seller who says they never
 * received it can be answered with.
 *
 * Settling is the one irreversible action in the product, so it is also the
 * one control that asks twice. The first press states what is about to happen
 * in full — the amount is already on the row above — and the second does it.
 * Refusing needs no second press: it hands the money back to the seller's
 * balance, and they can ask again.
 *
 * Drawn with no frame of its own: the queue row puts it on a band under the
 * address and draws the line between them.
 */
export function PayoutDecision({
  withdrawalId,
  amountCents,
  network,
}: {
  withdrawalId: string;
  /** Integer cents, so the confirmation can name the amount it is settling. */
  amountCents?: number;
  /** What the hash is checked against before the question is asked. */
  network?: string;
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
    <div>
      <p className="text-sm leading-5 font-semibold text-fg">
        Settle this payout
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <TextField
          id={ids.tx}
          name="txHash"
          label="Transaction hash"
          hint="Send the funds on-chain first, then paste the hash. Required to mark it sent."
          value={txHash}
          onChange={(e) => setTxHash(e.target.value)}
          // A hash is read character by character, so it gets the face
          // every other reference on the desk is set in.
          className="[&_input]:font-mono"
          autoComplete="off"
          spellCheck={false}
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
        <div className="mt-4 rounded-lg border border-danger/25 bg-danger-soft/70 p-3.5">
          <p className="flex items-start gap-2 text-[0.8125rem] leading-relaxed font-medium text-fg">
            <TriangleAlertIcon
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-danger"
            />
            <span>
              Marking{" "}
              {typeof amountCents === "number" ? (
                <Price
                  usd={amountCents / 100}
                  exact
                  className="font-semibold"
                />
              ) : (
                "this payout"
              )}{" "}
              as sent settles it against the seller&rsquo;s balance for good and
              closes the request. Check the address above against what the
              seller saved. There is no undo.
            </span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2 pl-6">
            <Button
              type="button"
              size="sm"
              variant="danger"
              disabled={pending || txHash.trim() === ""}
              onClick={() => decide("SENT")}
            >
              <BusyLabel
                busy={pending}
                label="Yes — it has been sent"
                busyLabel="Settling…"
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
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={pending || txHash.trim() === ""}
            onClick={() => {
              setMessage(null);
              // Checked again on the server, against the payout's network.
              const checked = network
                ? checkTxHash(network, txHash)
                : ({ ok: true } as const);
              if (!checked.ok) {
                setBad(true);
                setMessage(checked.error);
                return;
              }
              setArmed(true);
            }}
          >
            Mark as sent
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending || note.trim() === ""}
            onClick={() => decide("REJECTED")}
          >
            <BusyLabel
              busy={pending}
              label="Refuse and return it"
              busyLabel="Returning…"
            />
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
            "mt-3 flex items-start gap-1.5 text-[0.8125rem] leading-relaxed",
            bad ? "text-danger" : "text-verified",
          )}
        >
          {bad ? (
            <TriangleAlertIcon
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0"
            />
          ) : (
            <CheckCircle2Icon
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0"
            />
          )}
          <span>{message}</span>
        </p>
      ) : null}
    </div>
  );
}
