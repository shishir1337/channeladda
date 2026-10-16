"use client";

import {
  ClockIcon,
  EyeIcon,
  ImageIcon,
  ScissorsIcon,
  ShieldCheckIcon,
  XIcon,
} from "lucide-react";
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
  attachmentUrl: string | null;
  attachmentKind: "IMAGE" | "VIDEO" | null;
  /** Null once the file has been deleted, which happens after 48 hours. */
  attachmentExpiresAt: string | null;
  attachmentRemoved: boolean;
};

/** How long is left on an attachment, in words. */
function expiresIn(iso: string): string | null {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return null;
  const hours = Math.round(ms / 3_600_000);
  if (hours < 1) return "under an hour";
  if (hours === 1) return "1 hour";
  return `${hours} hours`;
}

/**
 * An attached photo or clip.
 *
 * Says how long it has left, because the 48 hour window is short enough that
 * somebody will come back for a screenshot and find it gone. Better to have
 * told them while it was still there.
 */
function Attachment({ message }: { message: ThreadMessageView }) {
  if (message.attachmentRemoved) {
    return (
      <p className="mt-2.5 flex items-start gap-1.5 border-t border-line pt-2.5 text-xs text-subtle">
        <ClockIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        <span>
          An attachment here was removed automatically after 48 hours. Chat is
          not storage — if a file matters, keep your own copy.
        </span>
      </p>
    );
  }

  if (!message.attachmentUrl) return null;

  const left = message.attachmentExpiresAt
    ? expiresIn(message.attachmentExpiresAt)
    : null;

  return (
    <figure className="mt-2.5">
      {message.attachmentKind === "VIDEO" ? (
        // biome-ignore lint/a11y/useMediaCaption: a user-sent clip has none
        <video
          src={message.attachmentUrl}
          controls
          preload="metadata"
          className="max-h-80 w-full rounded-card border border-line bg-black"
        />
      ) : (
        <a
          href={message.attachmentUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <img
            src={message.attachmentUrl}
            alt="Attachment"
            className="max-h-80 w-auto rounded-card border border-line"
          />
        </a>
      )}
      {left ? (
        <figcaption className="mt-1.5 flex items-center gap-1.5 text-[0.6875rem] text-subtle">
          <ClockIcon aria-hidden="true" className="size-3" />
          Removed in {left}
        </figcaption>
      ) : null}
    </figure>
  );
}

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
          {message.body ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-fg">
              {message.body}
            </p>
          ) : null}
          <Attachment message={message} />
          {message.redactedKinds ? (
            <p className="mt-2.5 flex items-start gap-1.5 border-t border-line pt-2.5 text-xs text-subtle">
              <ScissorsIcon
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0"
              />
              <span>
                {message.redactedKinds} removed. Deals stay on Channel Adda so
                we can stand behind them.
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
  const [attachment, setAttachment] = useState<{
    url: string;
    kind: "IMAGE" | "VIDEO";
    bytes: number;
    name: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Land on the newest message, the way every other chat does.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, []);

  const over = draft.length > MAX_MESSAGE;

  function send() {
    const body = draft.trim();
    // A photo on its own is a message; requiring words would just make people
    // type a full stop.
    if ((!body && !attachment) || over) return;
    setError(null);
    setNote(null);
    startTransition(async () => {
      const result = await postMessage(
        conversationId,
        body,
        attachment
          ? {
              url: attachment.url,
              kind: attachment.kind,
              bytes: attachment.bytes,
            }
          : undefined,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDraft("");
      setAttachment(null);
      setNote(result.note);
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  }

  async function upload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.set("kind", "message");
      form.set("file", file);
      const response = await fetch("/api/uploads", {
        method: "POST",
        body: form,
      });
      const data = (await response.json()) as {
        url?: string;
        bytes?: number;
        contentType?: string;
        error?: string;
      };
      if (!response.ok || !data.url) {
        setError(data.error ?? "That file could not be attached.");
        return;
      }
      setAttachment({
        url: data.url,
        kind: data.contentType?.startsWith("video/") ? "VIDEO" : "IMAGE",
        bytes: data.bytes ?? file.size,
        name: file.name,
      });
    } catch {
      setError("That upload did not finish. Check your connection.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="flex items-start gap-2 rounded-panel border border-line bg-surface-2 px-3.5 py-2.5 text-xs leading-relaxed text-muted">
        <EyeIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Channel Adda can read this conversation and will step in if something
          goes wrong. Phone numbers, emails and links are removed automatically.
          Photos and clips are deleted after 48 hours, and a thread with no deal
          on it clears after 10 days.
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

          {attachment ? (
            <div className="mt-2.5 flex items-center gap-3 rounded-card border border-line bg-surface-2 p-2.5">
              {attachment.kind === "IMAGE" ? (
                <img
                  src={attachment.url}
                  alt=""
                  className="size-12 rounded object-cover"
                />
              ) : (
                <span className="flex size-12 items-center justify-center rounded bg-surface text-xs text-muted">
                  clip
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-fg">
                  {attachment.name}
                </span>
                <span className="block text-[0.6875rem] text-subtle">
                  {(attachment.bytes / 1024 / 1024).toFixed(1)}MB · deleted
                  after 48 hours
                </span>
              </span>
              <button
                type="button"
                onClick={() => setAttachment(null)}
                aria-label="Remove attachment"
                className="cursor-pointer rounded p-1 text-subtle transition-colors duration-200 hover:text-fg"
              >
                <XIcon aria-hidden="true" className="size-4" />
              </button>
            </div>
          ) : null}

          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
                className="sr-only"
                id="attach"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={uploading || pending || attachment !== null}
                onClick={() => fileRef.current?.click()}
              >
                <ImageIcon aria-hidden="true" className="size-4" />
                {uploading ? "Attaching…" : "Photo or clip"}
              </Button>
              <p className="text-xs text-subtle">
                {over
                  ? `${(draft.length - MAX_MESSAGE).toLocaleString("en-US")} characters too many`
                  : "Up to 25MB"}
              </p>
            </div>
            <Button
              type="button"
              size="md"
              disabled={
                pending ||
                uploading ||
                over ||
                (draft.trim().length === 0 && attachment === null)
              }
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
