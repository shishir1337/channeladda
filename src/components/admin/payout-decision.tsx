"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { TextField } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { decidePayout } from "@/server/actions/wallet";

/**
 * Sending or refusing one payout.
 *
 * Sending requires the transaction hash. That is not bureaucracy: it is the
 * only evidence the money left, and the only thing a seller who says they
 * never received it can be answered with.
 */
export function PayoutDecision({ withdrawalId }: { withdrawalId: string }) {
  const router = useRouter();
  const ids = { tx: useId(), note: useId() };
  const [txHash, setTxHash] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const [pending, startTransition] = useTransition();

  const decide = (to: "SENT" | "REJECTED") => {
    setMessage(null);
    startTransition(async () => {
      const result = await decidePayout(withdrawalId, to, txHash, note);
      setBad(!result.ok);
      setMessage(result.ok ? result.message : result.error);
      if (result.ok) router.refresh();
    });
  };

  return (
    <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
      <TextField
        id={ids.tx}
        name="txHash"
        label="Transaction hash"
        hint="Required to mark it sent."
        value={txHash}
        onChange={(e) => setTxHash(e.target.value)}
      />
      <TextField
        id={ids.note}
        name="note"
        label="Reason, if rejecting"
        hint="The seller is told this."
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex flex-wrap gap-2.5 sm:col-span-2">
        <Button
          type="button"
          size="sm"
          disabled={pending || txHash.trim() === ""}
          onClick={() => decide("SENT")}
        >
          {pending ? "Saving…" : "Mark as sent"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={pending || note.trim() === ""}
          onClick={() => decide("REJECTED")}
        >
          Reject and return it
        </Button>
      </div>
      {message ? (
        <p
          role={bad ? "alert" : "status"}
          className={`text-xs sm:col-span-2 ${bad ? "text-danger" : "text-muted"}`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
