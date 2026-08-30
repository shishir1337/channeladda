"use client";

import { EyeIcon, ScissorsIcon, ShieldCheckIcon } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { MAX_MESSAGE } from "@/lib/messages";
import { postMessage } from "@/server/actions/messages";

/**
 * One conversation, read by whoever is in it.
 *
 * The rule this interface exists to carry is that buyers and sellers never get
 * a private line to each other. So the interface says so — plainly, at the top,
 * before anyone types — rather than silently deleting a phone number and
 * leaving someone to guess whether it was a bug.
 */

export type ThreadMessageView = {
  id: string;
  body: string;
  createdAt: string;
  mine: boolean;
  fromStaff: boolean;
  senderName: string;
  senderRole: "buyer" | "seller" | "staff";
  redactedKinds: string | null;
};

function when(iso: string) {
  const date = new Date(iso);
  const today = new Date().toDateString() === date.toDateString();
  return date.toLocaleString("en-US", {
    ...(today ? {} : { month: "short", day: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
  });
}

function Bubble({ message }: { message: ThreadMessageView }) {
  if (message.fromStaff) {
    return (
      <li className="flex flex-col items-center">
        <div className="w-full max-w-2xl rounded-panel border border-primary/30 bg-primary-soft p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-primary-text">
            <ShieldCheckIcon aria-hidden="true" className="size-3.5" />
            Channel Adda
            <span className="ml-auto font-normal text-subtle">
              {when(message.createdAt)}
            </span>
          </p>
          <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap text-fg">
            {message.body}
          </p>
        </div>
      </li>
    );
  }

  return (
    <li className={message.mine ? "flex justify-end" : "flex justify-start"}>
      <div className="max-w-[min(34rem,85%)]">
        <p
          className={`flex items-baseline gap-2 text-xs text-subtle ${
            message.mine ? "justify-end" : ""
          }`}
        >
          <span className="font-medium text-muted">
            {message.mine ? "You" : message.senderName}
          </span>
          <span>{when(message.createdAt)}</span>
        </p>
        <div
          className={`mt-1 rounded-panel border p-3.5 ${
            message.mine
              ? "border-primary/25 bg-primary-soft"
              : "border-line bg-surface"
          }`}
        >
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-fg">
            {message.body}
          </p>
          {message.redactedKinds ? (
            <p className="mt-2.5 flex items-start gap-1.5 border-t border-line pt-2.5 text-xs text-subtle">
              <ScissorsIcon
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0"
              />
              <span>
                {message.redactedKinds} removed. Deals stay on Channel Adda so
                escrow can protect them.
              </span>
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function ThreadView({
  conversationId,
  messages,
  closed,
  otherSide,
}: {
  conversationId: string;
  messages: ThreadMessageView[];
  closed: boolean;
  /** Who the reader is talking to, for the empty state. */
  otherSide: string;
}) {
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  // Land on the newest message, the way every other chat does.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, []);

  const over = draft.length > MAX_MESSAGE;

  function send() {
    const body = draft.trim();
    if (!body || over) return;
    setError(null);
    setNote(null);
    startTransition(async () => {
      const result = await postMessage(conversationId, body);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDraft("");
      setNote(result.note);
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="flex items-start gap-2 rounded-panel border border-line bg-surface-2 px-3.5 py-2.5 text-xs leading-relaxed text-muted">
        <EyeIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Channel Adda can read this conversation and will step in if something
          goes wrong. Phone numbers, emails and links are removed automatically
          — keep the deal here and escrow covers you.
        </span>
      </p>

      {messages.length === 0 ? (
        <p className="mt-4 rounded-panel border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
          No messages yet. Ask {otherSide} whatever you need to know before you
          commit.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-4">
          {messages.map((message) => (
            <Bubble key={message.id} message={message} />
          ))}
        </ul>
      )}
      <div ref={endRef} />

      {closed ? (
        <p className="mt-6 rounded-panel border border-line bg-surface-2 p-4 text-sm text-muted">
          Channel Adda closed this conversation. Nothing further can be sent.
        </p>
      ) : (
        <div className="mt-6">
          <label htmlFor="composer" className="sr-only">
            Write a message
          </label>
          <textarea
            id="composer"
            rows={3}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                send();
              }
            }}
            placeholder="Ask about revenue, traffic sources, strikes…"
            className="w-full resize-y rounded-panel border border-line bg-surface p-3.5 text-sm text-fg placeholder:text-subtle focus:border-primary/60 focus:outline-none"
          />

          {error ? (
            <p role="alert" className="mt-2 text-xs text-danger">
              {error}
            </p>
          ) : null}
          {note ? (
            <output className="mt-2 block text-xs text-primary-text">
              {note}
            </output>
          ) : null}

          <div className="mt-2.5 flex items-center justify-between gap-3">
            <p className="text-xs text-subtle">
              {over
                ? `${(draft.length - MAX_MESSAGE).toLocaleString("en-US")} characters too many`
                : "Cmd/Ctrl + Enter to send"}
            </p>
            <Button
              type="button"
              size="md"
              disabled={pending || over || draft.trim().length === 0}
              onClick={send}
            >
              {pending ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
