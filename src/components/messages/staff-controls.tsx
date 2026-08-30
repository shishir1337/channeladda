"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  claimThread,
  clearThreadFlag,
  setThreadClosed,
} from "@/server/actions/messages";

/**
 * What a moderator can do to a conversation.
 *
 * Claiming is first and separate: two moderators answering the same dispute in
 * different words is worse than a slow reply, so the thread gets an owner
 * before it gets an answer.
 */
export function StaffControls({
  conversationId,
  claimedBy,
  flagged,
  closed,
}: {
  conversationId: string;
  claimedBy: string | null;
  flagged: boolean;
  closed: boolean;
}) {
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(
    action: () => Promise<{
      ok: boolean;
      note?: string | null;
      error?: string;
    }>,
  ) {
    setNote(null);
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "That did not work.");
        return;
      }
      setNote(result.note ?? null);
    });
  }

  return (
    <div className="rounded-panel border border-line bg-surface-2 p-4">
      <p className="text-xs font-semibold tracking-[0.14em] text-subtle uppercase">
        Staff controls
      </p>

      <p className="mt-2 text-sm text-muted">
        {claimedBy
          ? `${claimedBy} is handling this conversation.`
          : "Nobody has picked this up yet."}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {claimedBy ? null : (
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => run(() => claimThread(conversationId))}
          >
            Take this one
          </Button>
        )}

        {flagged ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => run(() => clearThreadFlag(conversationId))}
          >
            Clear the flag
          </Button>
        ) : null}

        <Button
          type="button"
          size="sm"
          variant={closed ? "secondary" : "ghost"}
          disabled={pending}
          onClick={() => run(() => setThreadClosed(conversationId, !closed))}
        >
          {closed ? "Reopen conversation" : "Close conversation"}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="mt-2.5 text-xs text-danger">
          {error}
        </p>
      ) : null}
      {note ? (
        <output className="mt-2.5 block text-xs text-verified">{note}</output>
      ) : null}

      <p className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-subtle">
        Anything you send here is signed &ldquo;Channel Adda&rdquo; and both
        sides can read it. Your name is never shown to them.
      </p>
    </div>
  );
}
