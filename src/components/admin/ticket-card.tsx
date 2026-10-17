"use client";

import { TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Waited } from "@/components/admin/vocab";
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

const STATUS_STYLES = {
  OPEN: "border-primary/30 bg-primary-soft text-primary-text",
  ANSWERED: "border-verified/30 bg-verified-soft text-verified",
  CLOSED: "border-line bg-surface-2 text-subtle",
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

  function move(status: TicketView["status"]) {
    setError(null);
    startTransition(async () => {
      const result = await setTicketStatus(ticket.id, status, note);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <li className="relative bg-surface p-4 sm:p-5">
      {ticket.status === "OPEN" ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-[3px] bg-primary"
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold",
            STATUS_STYLES[ticket.status],
          )}
        >
          {STATUS_LABELS[ticket.status]}
        </span>
        <span className="text-sm font-semibold text-fg">{ticket.topic}</span>
        {ticket.orderRef ? (
          <span className="tnum rounded-md bg-surface-2 px-1.5 py-0.5 text-[0.6875rem] text-muted">
            {ticket.orderRef}
          </span>
        ) : null}
        <span className="ml-auto">
          <Waited
            since={new Date(ticket.createdAt)}
            prefix="sent"
            warnAfter={24}
            lateAfter={72}
          />
        </span>
      </div>

      <p className="mt-1.5 text-xs text-subtle">
        {ticket.fromId ? (
          <Link
            href={`/admin/users/${ticket.fromId}`}
            className="font-medium text-primary-text underline-offset-4 hover:underline"
          >
            {ticket.fromName}
          </Link>
        ) : (
          <span>Not signed in</span>
        )}
        <span className="text-subtle/70"> · </span>
        <span className="break-all">{ticket.email}</span>
        {ticket.handledBy ? ` · handled by ${ticket.handledBy}` : ""}
      </p>

      <p className="mt-3 rounded-card border border-line bg-surface-2 p-3 text-sm leading-relaxed whitespace-pre-wrap text-fg">
        {ticket.message}
      </p>

      <label
        htmlFor={`note-${ticket.id}`}
        className="mt-3 block text-xs font-medium text-fg"
      >
        What was done about it
      </label>
      <textarea
        id={`note-${ticket.id}`}
        rows={2}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="What you did about it, for whoever picks this up next"
        className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-base text-fg placeholder:text-subtle focus:border-primary/60 focus:outline-none sm:text-xs"
      />
      <p className="mt-1 text-[0.6875rem] text-subtle">
        {dirty
          ? "Unsaved — the note is written when you move the ticket."
          : "Saved with the ticket."}
      </p>

      <div className="mt-2.5 flex flex-wrap gap-2">
        {ticket.status !== "ANSWERED" ? (
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => move("ANSWERED")}
          >
            {pending ? "Saving…" : "Mark answered"}
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
    </li>
  );
}
