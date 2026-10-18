"use client";

import { LoaderCircleIcon, ShieldCheckIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/app/kit";
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
 *
 * Closing is the one action here that stops people talking, so it is the one
 * drawn in the danger colour, last and apart from the rest.
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
    <Card>
      <CardHeader
        as="h2"
        icon={ShieldCheckIcon}
        title="Staff controls"
        description={
          claimedBy
            ? `${claimedBy} is handling this conversation.`
            : "Nobody has picked this up yet."
        }
      />

      <CardBody className="flex flex-col gap-2">
        {claimedBy ? null : (
          <Button
            type="button"
            size="sm"
            className="w-full"
            disabled={pending}
            onClick={() => run(() => claimThread(conversationId))}
          >
            {pending ? (
              <LoaderCircleIcon
                aria-hidden="true"
                className="size-4 animate-spin"
              />
            ) : null}
            Take this one
          </Button>
        )}

        {flagged ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="w-full"
            disabled={pending}
            onClick={() => run(() => clearThreadFlag(conversationId))}
          >
            Clear the flag
          </Button>
        ) : null}

        <Button
          type="button"
          size="sm"
          variant={closed ? "secondary" : "danger"}
          className={claimedBy && !flagged ? "w-full" : "mt-2 w-full"}
          disabled={pending}
          onClick={() => run(() => setThreadClosed(conversationId, !closed))}
        >
          {closed ? "Reopen conversation" : "Close conversation"}
        </Button>

        {error ? (
          <p
            role="alert"
            className="mt-1 text-[0.8125rem] font-medium text-danger"
          >
            {error}
          </p>
        ) : null}
        {note ? (
          <output className="mt-1 block text-[0.8125rem] text-verified">
            {note}
          </output>
        ) : null}
      </CardBody>

      <CardFooter className="text-xs leading-relaxed text-subtle">
        Anything you send here is signed &ldquo;Channel Adda&rdquo; and both
        sides can read it. Your name is never shown to them.
      </CardFooter>
    </Card>
  );
}
