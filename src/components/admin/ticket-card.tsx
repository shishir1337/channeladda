"use client";

import { TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Waited } from "@/components/admin/vocab";
import {
  Dot,
  hintClass,
  ListItem,
  labelClass,
  Reference,
  Sep,
  textareaClass,
} from "@/components/app/kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { setTicketStatus } from "@/server/actions/support";

/**
 * One support request, with the two things a moderator does to it: write down
 * what was done, and move it out of the queue.
 *
 * The note is saved by the same call that moves the ticket, so the buttons say
 * so — somebody who types a note and never presses anything has saved nothing,
 * and used to have no way of knowing that.
 */

export type TicketView = {
  id: string;
  email: string;
  topic: string;
  orderRef: string | null;
  message: string;
  status: "OPEN" | "ANSWERED" | "CLOSED";
  createdAt: string;
  fromName: string | null;
  fromId: string | null;
  handledBy: string | null;
  staffNote: string | null;
};

const STATUS_VARIANT = {
  OPEN: "primary",
  ANSWERED: "verified",
  CLOSED: "neutral",
} as const;

const STATUS_LABELS = {
  OPEN: "Open",
  ANSWERED: "Answered",
  CLOSED: "Closed",
} as const;

export function TicketCard({ ticket }: { ticket: TicketView }) {
  const [note, setNote] = useState(ticket.staffNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = note.trim() !== (ticket.staffNote ?? "").trim();
  // Open tickets are the queue; the rest are kept for the record, so they
  // read a step quieter.
  const open = ticket.status === "OPEN";

  function move(status: TicketView["status"]) {
    setError(null);
    startTransition(async () => {
      const result = await setTicketStatus(ticket.id, status, note);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <ListItem flag={open ? "primary" : undefined} className="py-4 sm:py-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-60">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-sm leading-5 font-medium text-fg">
              {ticket.topic}
            </span>
            {ticket.orderRef ? <Reference>{ticket.orderRef}</Reference> : null}
          </div>
          <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[0.8125rem] leading-5 text-muted">
            {ticket.fromId ? (
              <Link
                href={`/admin/users/${ticket.fromId}`}
                className="font-medium text-fg underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-fg"
              >
                {ticket.fromName}
              </Link>
            ) : (
              <span>Not signed in</span>
            )}
            <Sep />
            <span className="break-all">{ticket.email}</span>
            {ticket.handledBy ? (
              <>
                <Sep />
                <span>handled by {ticket.handledBy}</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Waited
            since={new Date(ticket.createdAt)}
            prefix="sent"
            warnAfter={24}
            lateAfter={72}
          />
          <Badge variant={STATUS_VARIANT[ticket.status]} size="sm">
            {STATUS_LABELS[ticket.status]}
          </Badge>
        </div>
      </div>

      <p
        className={cn(
          "mt-3 max-w-[80ch] border-l-2 border-line pl-3 text-sm leading-[1.6] break-words whitespace-pre-wrap",
          open ? "text-fg" : "text-muted",
        )}
      >
        {ticket.message}
      </p>

      <div className="mt-4">
        <label htmlFor={`note-${ticket.id}`} className={labelClass}>
          What was done about it
        </label>
        <textarea
          id={`note-${ticket.id}`}
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="What you did about it, for whoever picks this up next"
          className={cn(textareaClass, "mt-1.5 min-h-[4.5rem]")}
        />
        <div className="mt-2.5 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          {/* Only an unsaved note is flagged. "Saved with the ticket" under
              every ticket in the queue was one sentence said once per row,
              and the section's (i) already says when a note is written. */}
          {dirty ? (
            <p
              className={cn(
                hintClass,
                "mt-0 inline-flex items-center gap-1.5 text-muted",
              )}
            >
              <Dot tone="primary" />
              Unsaved — the note is written when you move the ticket.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            {ticket.status !== "ANSWERED" ? (
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={() => move("ANSWERED")}
              >
                {/* Both labels share one cell, so the button keeps the width
                    of the wider one while it saves. */}
                <span className="inline-grid">
                  <span
                    className={cn(
                      "col-start-1 row-start-1",
                      pending && "invisible",
                    )}
                  >
                    Mark answered
                  </span>
                  <span
                    className={cn(
                      "col-start-1 row-start-1",
                      !pending && "invisible",
                    )}
                  >
                    Saving…
                  </span>
                </span>
              </Button>
            ) : null}
            {ticket.status !== "CLOSED" ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() => move("CLOSED")}
              >
                Close it
              </Button>
            ) : null}
            {ticket.status !== "OPEN" ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => move("OPEN")}
              >
                Put back in the queue
              </Button>
            ) : null}
          </div>
        </div>

        {error ? (
          <p
            role="alert"
            className="mt-2 flex items-start gap-1.5 text-xs text-danger"
          >
            <TriangleAlertIcon
              aria-hidden="true"
              className="mt-px size-3.5 shrink-0"
            />
            <span>{error}</span>
          </p>
        ) : null}
      </div>
    </ListItem>
  );
}
