"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setTicketStatus } from "@/server/actions/support";

/**
 * One support request, with the two things a moderator does to it: write down
 * what was done, and move it out of the queue.
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
  CLOSED: "border-line text-subtle",
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

  function move(status: TicketView["status"]) {
    setError(null);
    startTransition(async () => {
      const result = await setTicketStatus(ticket.id, status, note);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <li className="bg-surface p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[ticket.status]}`}
        >
          {STATUS_LABELS[ticket.status]}
        </span>
        <span className="font-medium text-fg">{ticket.topic}</span>
        {ticket.orderRef ? (
          <span className="tnum text-xs text-subtle">
            Order {ticket.orderRef}
          </span>
        ) : null}
        <span className="ml-auto text-xs text-subtle">
          {new Date(ticket.createdAt).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
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
        {" · "}
        {ticket.email}
        {ticket.handledBy ? ` · handled by ${ticket.handledBy}` : ""}
      </p>

      <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap text-fg">
        {ticket.message}
      </p>

      <label htmlFor={`note-${ticket.id}`} className="sr-only">
        What was done about it
      </label>
      <textarea
        id={`note-${ticket.id}`}
        rows={2}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="What you did about it, for whoever picks this up next"
        className="mt-3 w-full rounded-lg border border-line bg-surface-2 p-2.5 text-xs text-fg placeholder:text-subtle focus:border-primary/60 focus:outline-none"
      />

      <div className="mt-2.5 flex flex-wrap gap-2">
        {ticket.status !== "ANSWERED" ? (
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => move("ANSWERED")}
          >
            Mark answered
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
            Close
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
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </li>
  );
}
