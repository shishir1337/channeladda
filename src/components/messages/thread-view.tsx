"use client";

import {
  ClockIcon,
  EyeIcon,
  ImageIcon,
  LoaderCircleIcon,
  MessageSquareIcon,
  ScissorsIcon,
  SendIcon,
  ShieldCheckIcon,
  TagIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  ChatOfferCard,
  type ThreadOfferView,
} from "@/components/messages/chat-offer-card";
import { EventLine } from "@/components/messages/event-line";
import {
  type OfferComposerConfig,
  OfferComposerForm,
} from "@/components/messages/offer-composer";
import { OfferActions } from "@/components/offers/offer-actions";
import { Button } from "@/components/ui/button";
import { chatTime } from "@/lib/chat-time";
import { MAX_MESSAGE } from "@/lib/messages";
import { cn } from "@/lib/utils";
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
  kind: "TEXT" | "OFFER" | "EVENT";
  body: string;
  createdAt: string;
  mine: boolean;
  fromStaff: boolean;
  senderName: string;
  senderRole: "buyer" | "seller" | "staff" | "agent" | "system";
  /** Set on an offer card only. */
  offer: ThreadOfferView | null;
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
      <p className="mt-2.5 flex items-start gap-1.5 border-t border-line pt-2.5 text-xs leading-relaxed text-subtle">
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
          {/* biome-ignore lint/performance/noImgElement: private attachment served per viewer; the image optimiser would cache it outside that check */}
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

const when = chatTime;

/** The deal's agent writes as themselves, and says whose agent they are. */
function displayName(message: ThreadMessageView) {
  return message.senderRole === "agent"
    ? `${message.senderName} · Channel Adda agent`
    : message.senderName;
}

function Bubble({ message }: { message: ThreadMessageView }) {
  if (message.fromStaff) {
    return (
      <li className="flex flex-col items-center">
        <div className="w-full max-w-2xl rounded-panel border border-primary/30 bg-primary-soft p-4">
          <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-primary-text">
            <ShieldCheckIcon aria-hidden="true" className="size-3.5" />
            Channel Adda
            <span className="ml-auto font-normal text-subtle">
              {when(message.createdAt)}
            </span>
          </p>
          <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-fg">
            {message.body}
          </p>
        </div>
      </li>
    );
  }

  return (
    <li className={message.mine ? "flex justify-end" : "flex justify-start"}>
      <div
        className={cn(
          "flex max-w-[min(34rem,92%)] gap-2.5",
          message.mine && "flex-row-reverse",
        )}
      >
        {!message.mine ? (
          <span
            aria-hidden="true"
            className="mt-6 grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-semibold text-muted"
          >
            {message.senderName.trim().charAt(0).toUpperCase()}
          </span>
        ) : null}

        <div className="min-w-0">
          <p
            className={cn(
              "flex items-baseline gap-2 text-xs text-subtle",
              message.mine && "justify-end",
            )}
          >
            <span className="font-medium text-muted">
              {message.mine ? "You" : displayName(message)}
            </span>
            <span>{when(message.createdAt)}</span>
          </p>
          <div
            className={cn(
              "mt-1 border p-3.5",
              message.mine
                ? "rounded-panel rounded-tr-md border-primary/25 bg-primary-soft"
                : "rounded-panel rounded-tl-md border-line bg-surface",
            )}
          >
            {message.body ? (
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-fg">
                {message.body}
              </p>
            ) : null}
            <Attachment message={message} />
            {message.redactedKinds ? (
              <p className="mt-2.5 flex items-start gap-1.5 border-t border-line pt-2.5 text-xs leading-relaxed text-subtle">
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
      </div>
    </li>
  );
}

export function ThreadView({
  conversationId,
  messages,
  closed,
  otherSide,
  viewerRole,
  offerComposer = null,
}: {
  conversationId: string;
  messages: ThreadMessageView[];
  closed: boolean;
  /** Who the reader is talking to, for the empty state. */
  otherSide: string;
  /** How the reader is involved, so an offer card can say whose move it is. */
  viewerRole: "buyer" | "seller" | "agent" | "staff";
  /**
   * Set when the reader can put a number on the table right now: a buyer's
   * offer or a seller's price. Null hides the button, so nobody is offered
   * something the server would refuse.
   */
  offerComposer?: OfferComposerConfig | null;
}) {
  const [offering, setOffering] = useState(false);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [attachment, setAttachment] = useState<{
    /** The storage key, which is what the server will accept. */
    key: string;
    /** An object URL for the local preview. Revoked when it is cleared. */
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
  const left = MAX_MESSAGE - draft.length;

  function send() {
    const body = draft.trim();
    // A photo on its own is a message; requiring words would just make people
    // type a full stop.
    if ((!body && !attachment) || over) return;
    setError(null);
    setNote(null);
    startTransition(async () => {
      const result = await postMessage(conversationId, body, attachment?.key);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDraft("");
      if (attachment) URL.revokeObjectURL(attachment.url);
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
        key?: string;
        bytes?: number;
        contentType?: string;
        error?: string;
      };
      if (!response.ok || !data.url || !data.key) {
        setError(data.error ?? "That file could not be attached.");
        return;
      }
      setAttachment({
        key: data.key,
        // A local blob, not the server URL. Nothing references the file yet,
        // so the serving route will not release it to anybody — including the
        // person who just uploaded it — until a message points at it.
        url: URL.createObjectURL(file),
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
      <p className="flex items-start gap-2.5 rounded-card border border-line bg-surface-2 px-3.5 py-3 text-xs leading-relaxed text-muted">
        <EyeIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>
          <strong className="font-semibold text-fg">
            Channel Adda can read this conversation
          </strong>{" "}
          and will step in if something goes wrong. Phone numbers, emails and
          links are removed automatically. Photos and clips are deleted after 48
          hours, and a thread with no deal on it clears after 10 days.
        </span>
      </p>

      {messages.length === 0 ? (
        <div className="mt-4 flex flex-col items-center rounded-panel border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-surface-2 text-subtle">
            <MessageSquareIcon aria-hidden="true" className="size-5" />
          </span>
          <p className="mt-3.5 font-display text-[0.9375rem] font-bold text-fg">
            No messages yet
          </p>
          <p className="mx-auto mt-1.5 max-w-[46ch] text-sm leading-relaxed text-muted">
            Ask {otherSide} whatever you need to know before you commit —
            revenue, where the traffic comes from, strikes, why they are
            selling.
          </p>
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-4">
          {messages.map((message) =>
            message.kind === "EVENT" ? (
              <EventLine key={message.id} message={message} />
            ) : message.kind === "OFFER" && message.offer ? (
              <ChatOfferCard
                key={message.id}
                offer={message.offer}
                viewerRole={viewerRole}
                senderName={message.mine ? "You" : displayName(message)}
                mine={message.mine}
                createdAt={message.createdAt}
                actions={
                  (viewerRole === "buyer" || viewerRole === "seller") &&
                  message.offer.effectiveStatus === "OPEN" ? (
                    <OfferActions
                      offer={{
                        id: message.offer.id,
                        amount: message.offer.amountCents / 100,
                        awaiting: message.offer.awaiting,
                        bySeller: message.offer.bySeller,
                        effectiveStatus: message.offer.effectiveStatus,
                      }}
                      viewingAs={viewerRole}
                    />
                  ) : undefined
                }
              />
            ) : (
              <Bubble key={message.id} message={message} />
            ),
          )}
        </ul>
      )}
      <div ref={endRef} />

      {closed ? (
        <p className="mt-6 flex items-start gap-2.5 rounded-panel border border-line bg-surface-2 p-4 text-sm leading-relaxed text-muted">
          <ShieldCheckIcon
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0"
          />
          <span>
            Channel Adda closed this conversation. Nothing further can be sent.
          </span>
        </p>
      ) : (
        <div className="mt-6 rounded-panel border border-line bg-surface p-3.5 focus-within:border-primary/50 sm:p-4">
          {offering && offerComposer ? (
            <div className="mb-3.5">
              <OfferComposerForm
                config={offerComposer}
                onDone={() => setOffering(false)}
              />
            </div>
          ) : null}
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
            aria-invalid={over}
            className="w-full resize-y bg-transparent text-base leading-relaxed text-fg placeholder:text-subtle focus:outline-none sm:text-[0.9375rem]"
          />

          {attachment ? (
            <div className="mt-2.5 flex items-center gap-3 rounded-card border border-line bg-surface-2 p-2.5">
              {attachment.kind === "IMAGE" ? (
                // biome-ignore lint/performance/noImgElement: a local preview of the file being sent, not a served image
                <img
                  src={attachment.url}
                  alt=""
                  className="size-12 rounded-lg object-cover"
                />
              ) : (
                <span className="flex size-12 items-center justify-center rounded-lg bg-surface text-xs text-muted">
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
                onClick={() => {
                  URL.revokeObjectURL(attachment.url);
                  setAttachment(null);
                }}
                aria-label="Remove attachment"
                className="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg text-subtle transition-colors duration-200 hover:bg-surface hover:text-fg"
              >
                <XIcon aria-hidden="true" className="size-4" />
              </button>
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            <div className="flex min-w-0 items-center gap-3">
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
                {uploading ? (
                  <LoaderCircleIcon
                    aria-hidden="true"
                    className="size-4 animate-spin"
                  />
                ) : (
                  <ImageIcon aria-hidden="true" className="size-4" />
                )}
                {uploading ? "Attaching…" : "Photo or clip"}
              </Button>
              {offerComposer ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  aria-expanded={offering}
                  onClick={() => setOffering((was) => !was)}
                >
                  <TagIcon aria-hidden="true" className="size-4" />
                  {offerComposer.mode === "price"
                    ? "Offer a price"
                    : "Make an offer"}
                </Button>
              ) : null}
              <p
                className={cn(
                  "min-w-0 text-xs",
                  over ? "font-medium text-danger" : "text-subtle",
                )}
              >
                {over
                  ? `${(draft.length - MAX_MESSAGE).toLocaleString("en-US")} characters too many`
                  : left < 400
                    ? `${left.toLocaleString("en-US")} characters left`
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
              {pending ? (
                <LoaderCircleIcon
                  aria-hidden="true"
                  className="size-4 animate-spin"
                />
              ) : (
                <SendIcon aria-hidden="true" className="size-4" />
              )}
              {pending ? "Sending…" : "Send"}
            </Button>
          </div>

          {error ? (
            <p role="alert" className="mt-2.5 text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}
          {note ? (
            <output className="mt-2.5 block text-xs leading-relaxed text-primary-text">
              {note}
            </output>
          ) : null}
        </div>
      )}
    </div>
  );
}
