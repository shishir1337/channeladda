"use client";

import {
  CircleAlertIcon,
  ClockIcon,
  EyeIcon,
  ImageIcon,
  LoaderCircleIcon,
  LockIcon,
  MessageSquareIcon,
  ScissorsIcon,
  SendIcon,
  ShieldCheckIcon,
  TagIcon,
  XIcon,
} from "lucide-react";
import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { InfoTip } from "@/components/app/info-tip";
import { EmptyState } from "@/components/app/kit";
import {
  ChatOfferCard,
  type ThreadOfferView,
} from "@/components/messages/chat-offer-card";
import { BusyLabel, Initials } from "@/components/messages/chat-parts";
import { EventLine } from "@/components/messages/event-line";
import {
  type OfferComposerConfig,
  OfferComposerForm,
} from "@/components/messages/offer-composer";
import { OfferActions } from "@/components/offers/offer-actions";
import { Button } from "@/components/ui/button";
import { iconText } from "@/components/ui/icon-hue";
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
      <p
        className={cn(
          "flex items-start gap-1.5 text-xs leading-relaxed text-subtle",
          message.body && "mt-2 border-t border-fg/10 pt-2",
        )}
      >
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
    <figure className={message.body ? "mt-2" : undefined}>
      {message.attachmentKind === "VIDEO" ? (
        // biome-ignore lint/a11y/useMediaCaption: a user-sent clip has none
        <video
          src={message.attachmentUrl}
          controls
          preload="metadata"
          className="max-h-80 w-full rounded-lg border border-fg/10 bg-black"
        />
      ) : (
        <a
          href={message.attachmentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-fit rounded-lg transition-opacity duration-150 hover:opacity-90"
        >
          {/* biome-ignore lint/performance/noImgElement: private attachment served per viewer; the image optimiser would cache it outside that check */}
          <img
            src={message.attachmentUrl}
            alt="Attachment"
            className="max-h-80 w-auto rounded-lg border border-fg/10"
          />
        </a>
      )}
      {left ? (
        <figcaption className="mt-1.5 flex items-center gap-1.5 text-xs text-subtle">
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

/**
 * Messages a few minutes apart from the same person read as one turn: one
 * name and time over the lot, close together, so a run of short replies does
 * not repeat the same header four times.
 */
const GROUP_MS = 5 * 60_000;

/**
 * Sends a photo or clip to the upload route; never throws.
 *
 * Outside the component on purpose: the React Compiler gives up on a whole
 * component over a try statement, and the thread re-renders on every
 * keystroke in the message box.
 */
async function sendAttachment(
  file: File,
): Promise<
  | { ok: true; key: string; bytes: number; video: boolean }
  | { ok: false; error: string }
> {
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
      return {
        ok: false,
        error: data.error ?? "That file could not be attached.",
      };
    }
    return {
      ok: true,
      key: data.key,
      bytes: data.bytes ?? file.size,
      video: data.contentType?.startsWith("video/") ?? false,
    };
  } catch {
    return {
      ok: false,
      error: "That upload did not finish. Check your connection.",
    };
  }
}

function sameTurn(a: ThreadMessageView, b: ThreadMessageView) {
  return (
    a.kind === "TEXT" &&
    b.kind === "TEXT" &&
    !a.fromStaff &&
    !b.fromStaff &&
    a.mine === b.mine &&
    a.senderName === b.senderName &&
    a.senderRole === b.senderRole &&
    Math.abs(
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ) < GROUP_MS
  );
}

function Bubble({
  message,
  first,
  last,
}: {
  message: ThreadMessageView;
  /** Opens a turn: carries the name, the time and the avatar. */
  first: boolean;
  /** Closes a turn: keeps its full corner on the sender's side. */
  last: boolean;
}) {
  if (message.fromStaff) {
    return (
      <li className="flex justify-center">
        <div className="w-full max-w-xl rounded-card border border-primary/35 bg-primary-soft px-4 py-3">
          <p className="flex flex-wrap items-center gap-1.5 text-[0.8125rem] font-medium text-fg">
            <ShieldCheckIcon
              aria-hidden="true"
              className="size-3.5 text-primary-text"
            />
            Channel Adda
            <span className="ml-auto text-xs font-normal text-subtle tabular-nums">
              {when(message.createdAt)}
            </span>
          </p>
          <p className="mt-1.5 text-sm leading-relaxed wrap-break-word whitespace-pre-wrap text-fg">
            {message.body}
          </p>
        </div>
      </li>
    );
  }

  const agent = message.senderRole === "agent";

  return (
    <li
      className={cn(
        "group/msg flex",
        message.mine ? "justify-end" : "justify-start",
        // The list spaces turns apart; messages inside one sit close.
        !first && "-mt-4",
      )}
    >
      <div
        className={cn(
          "flex max-w-[min(34rem,88%)] min-w-0 gap-2",
          message.mine && "flex-row-reverse",
        )}
      >
        {!message.mine ? (
          first ? (
            agent ? (
              <span
                aria-hidden="true"
                className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg"
              >
                <ShieldCheckIcon className="size-3.5" />
              </span>
            ) : (
              <Initials name={message.senderName} className="mt-0.5 size-7" />
            )
          ) : (
            <span aria-hidden="true" className="w-7 shrink-0" />
          )
        ) : null}

        <div className="min-w-0">
          {first ? (
            <p
              className={cn(
                "mb-1 flex items-baseline gap-1.5 text-xs text-subtle",
                message.mine && "justify-end",
              )}
            >
              {agent && !message.mine ? (
                <>
                  <span className="font-medium text-fg">
                    {message.senderName}
                  </span>
                  <span className="inline-flex h-5 items-center gap-1 self-center rounded-full border border-primary/35 bg-primary-soft px-1.5 text-[0.6875rem] font-medium text-primary-text">
                    <ShieldCheckIcon aria-hidden="true" className="size-3" />
                    Channel Adda agent
                  </span>
                </>
              ) : (
                <span className="font-medium text-muted">
                  {message.mine ? "You" : displayName(message)}
                </span>
              )}
              <span className="tabular-nums">{when(message.createdAt)}</span>
            </p>
          ) : null}
          <div
            className={cn(
              "flex items-end gap-2",
              message.mine && "flex-row-reverse",
            )}
          >
            <div
              className={cn(
                "min-w-0 rounded-card px-3.5 py-2",
                message.mine
                  ? "rounded-tr-md bg-surface-3 text-fg"
                  : agent
                    ? // The agent is the one voice both sides should never
                      // miss: what to do next, and that it is safe to do it.
                      "rounded-tl-md border border-primary/40 bg-primary-soft text-fg"
                    : "rounded-tl-md border border-line bg-surface text-fg",
                !last && (message.mine ? "rounded-br-md" : "rounded-bl-md"),
              )}
            >
              {/* Only the first bubble of a turn shows the name, so the rest
                  say it to a screen reader instead. */}
              {first ? null : (
                <span className="sr-only">
                  {message.mine ? "You" : displayName(message)}:{" "}
                </span>
              )}
              {message.body ? (
                <p className="text-sm leading-relaxed wrap-break-word whitespace-pre-wrap">
                  {message.body}
                </p>
              ) : null}
              <Attachment message={message} />
              {message.redactedKinds ? (
                <p className="mt-2 flex items-start gap-1.5 border-t border-fg/10 pt-2 text-xs leading-relaxed text-subtle">
                  <ScissorsIcon
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0"
                  />
                  <span>
                    {message.redactedKinds} removed. Deals stay on Channel Adda
                    so we can stand behind them.
                  </span>
                </p>
              ) : null}
            </div>
            {/* Inside a turn the time is on hover, beside the message it
                belongs to; screen readers hear it either way. */}
            {first ? null : (
              <span className="mb-1.5 shrink-0 text-xs whitespace-nowrap text-subtle tabular-nums opacity-0 transition-opacity duration-150 group-hover/msg:opacity-100">
                {when(message.createdAt)}
              </span>
            )}
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
  after = null,
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
  /**
   * Drawn after the last line of the conversation: what the chat asks of
   * the reader once the deal is over, as the next thing in it.
   */
  after?: ReactNode;
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
  const scrollerRef = useRef<HTMLDivElement>(null);
  /** Whether the reader is following the newest message. */
  const following = useRef(true);

  // Land on the newest message, the way every other chat does — and stay
  // there while the box changes size. In the window-height view the messages
  // scroll inside their own box, which is only its final size once styles,
  // fonts and images have settled; a single scroll on mount often ran before
  // that and left the conversation open at the top. Someone who has scrolled
  // up to read is left exactly where they are.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const ownScroll = () => getComputedStyle(scroller).overflowY === "auto";

    endRef.current?.scrollIntoView({ block: "end" });

    const onScroll = () => {
      following.current =
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
    };
    // Only the box's own scroll, never the page's: on a phone the page is
    // what scrolls, and dragging it back to the bottom would be hostile.
    const keepAtEnd = () => {
      if (following.current && ownScroll()) {
        scroller.scrollTop = scroller.scrollHeight;
      }
    };
    const observer = new ResizeObserver(keepAtEnd);
    observer.observe(scroller);
    for (const child of scroller.children) observer.observe(child);
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      scroller.removeEventListener("scroll", onScroll);
    };
  }, []);

  const over = draft.length > MAX_MESSAGE;
  const left = MAX_MESSAGE - draft.length;
  const hasSomething = draft.trim().length > 0 || attachment !== null;

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
    const sent = await sendAttachment(file);
    if (sent.ok) {
      setAttachment({
        key: sent.key,
        // A local blob, not the server URL. Nothing references the file yet,
        // so the serving route will not release it to anybody — including the
        // person who just uploaded it — until a message points at it.
        url: URL.createObjectURL(file),
        kind: sent.video ? "VIDEO" : "IMAGE",
        bytes: sent.bytes,
        name: file.name,
      });
    } else {
      setError(sent.error);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    // On a phone the message box is pinned to the bottom of the screen, so
    // the conversation keeps room under its last message for it.
    <div className="flex min-h-0 flex-1 flex-col max-lg:pb-24">
      {/* The scrolling part. In the window-height view (see the thread page)
          only this moves; everywhere else it is simply the page. */}
      <div
        ref={scrollerRef}
        className="lg:@3xl:min-h-0 lg:@3xl:flex-1 lg:@3xl:overflow-y-auto lg:@3xl:overscroll-contain lg:@3xl:pr-2 lg:@3xl:[scrollbar-width:thin]"
      >
        {/* A quiet line rather than a box: it is read once, before the first
          message, and should not compete with the conversation after that.
          One line on screen; the rule itself, word for word, behind the (i). */}
        <p className="mx-auto flex max-w-[66ch] items-center gap-2 px-1 text-xs leading-relaxed text-muted">
          <EyeIcon
            aria-hidden="true"
            className="size-3.5 shrink-0 text-subtle"
          />
          <span>Channel Adda can see this chat, to keep you safe.</span>
          <InfoTip label="About this chat">
            Channel Adda can read this conversation and will step in if
            something goes wrong. Phone numbers, emails and links are removed
            automatically. Photos and clips are deleted after 48 hours, and a
            thread with no deal on it clears after 10 days.
          </InfoTip>
        </p>

        {messages.length === 0 ? (
          <EmptyState
            bare
            className="py-14"
            icon={MessageSquareIcon}
            title="No messages yet"
            body={`Ask ${otherSide} whatever you need to know before you commit — revenue, where the traffic comes from, strikes, why they are selling.`}
          />
        ) : (
          <ul className="mt-6 flex flex-col gap-5">
            {messages.map((message, index) => {
              const prev = messages[index - 1];
              const next = messages[index + 1];
              return message.kind === "EVENT" ? (
                <EventLine
                  key={message.id}
                  message={message}
                  // A run of history lines reads as one block of record.
                  className={prev?.kind === "EVENT" ? "-mt-3" : undefined}
                />
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
                <Bubble
                  key={message.id}
                  message={message}
                  first={!prev || !sameTurn(prev, message)}
                  last={!next || !sameTurn(message, next)}
                />
              );
            })}
          </ul>
        )}
        {after ? <div className="mt-6">{after}</div> : null}
        {/* The margin lands the message box on screen with the newest
          message, rather than leaving it just under the fold. */}
        <div ref={endRef} className="scroll-mb-48" />
      </div>

      {closed ? (
        <p className="mt-6 flex items-start justify-center gap-2 rounded-card border border-line bg-surface-2/60 px-4 py-3 text-[0.8125rem] leading-relaxed text-muted">
          <LockIcon
            aria-hidden="true"
            className={`mt-0.5 size-3.5 shrink-0 ${iconText(LockIcon)}`}
          />
          <span>
            Channel Adda closed this conversation. Nothing further can be sent.
          </span>
        </p>
      ) : (
        // On a computer the box stays at the bottom of the window while the
        // conversation scrolls under it. On a phone it is fixed to the bottom
        // of the screen, as every messaging app does, and capped so an open
        // offer form scrolls inside it rather than pushing its top off screen.
        <div className="relative mt-6 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-30 max-lg:mt-0 max-lg:max-h-[70dvh] max-lg:overflow-y-auto max-lg:overscroll-contain max-lg:border-t max-lg:border-line max-lg:bg-bg/95 max-lg:px-3 max-lg:pt-2 max-lg:pb-[max(0.5rem,env(safe-area-inset-bottom))] max-lg:backdrop-blur-xl lg:sticky lg:bottom-0 lg:z-10 lg:bg-bg lg:pb-5 lg:before:pointer-events-none lg:before:absolute lg:before:inset-x-0 lg:before:bottom-full lg:before:h-6 lg:before:bg-linear-to-t lg:before:from-bg lg:before:to-transparent">
          {offering && offerComposer ? (
            <OfferComposerForm
              config={offerComposer}
              onDone={() => setOffering(false)}
            />
          ) : null}

          {/* One row on a phone — attach, offer, the text, send — so the box
              takes a line of the screen rather than three. */}
          <div className="rounded-card border border-line bg-surface shadow-xs transition-[border-color,box-shadow] duration-150 not-focus-within:hover:border-line-strong focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/20 has-[[aria-invalid=true]]:border-danger has-[[aria-invalid=true]]:ring-danger/15 max-lg:flex max-lg:flex-wrap max-lg:items-end max-lg:gap-0.5 max-lg:rounded-[1.375rem] max-lg:p-1 dark:bg-surface-2">
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
              placeholder="Write a message…"
              aria-invalid={over}
              className="block max-h-72 min-h-20 w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-base leading-6 field-sizing-content text-fg placeholder:text-subtle focus:outline-none max-lg:order-2 max-lg:max-h-32 max-lg:min-h-11 max-lg:w-auto max-lg:min-w-0 max-lg:flex-1 max-lg:px-2 max-lg:py-2.5 sm:text-sm"
            />

            {attachment ? (
              <div className="mx-2 mb-1 flex items-center gap-3 rounded-lg border border-line bg-surface-2 p-2 max-lg:order-0 max-lg:mx-0 max-lg:basis-full">
                {attachment.kind === "IMAGE" ? (
                  // biome-ignore lint/performance/noImgElement: a local preview of the file being sent, not a served image
                  <img
                    src={attachment.url}
                    alt=""
                    className="size-10 rounded-md object-cover"
                  />
                ) : (
                  <span className="flex size-10 items-center justify-center rounded-md border border-line bg-surface text-xs text-muted">
                    clip
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.8125rem] font-medium text-fg">
                    {attachment.name}
                  </span>
                  <span className="block text-xs text-subtle tabular-nums">
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
                  className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-subtle transition-colors duration-150 hover:bg-surface-3 hover:text-fg pointer-fine:size-8"
                >
                  <XIcon aria-hidden="true" className="size-4" />
                </button>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-1 px-2 pt-1 pb-2 max-lg:contents">
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
                size="icon"
                variant="ghost"
                title="Photo or clip"
                className="max-lg:order-1"
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
                <span className="sr-only">
                  {uploading ? "Attaching…" : "Photo or clip"}
                </span>
              </Button>
              {offerComposer ? (
                <Button
                  type="button"
                  variant="ghost"
                  aria-expanded={offering}
                  onClick={() => setOffering((was) => !was)}
                  title={
                    offerComposer.mode === "price"
                      ? "Offer a price"
                      : "Make an offer"
                  }
                  className="aria-expanded:bg-surface-2 aria-expanded:text-fg max-lg:order-1 max-lg:size-11 max-lg:px-0"
                >
                  <TagIcon aria-hidden="true" className="size-4" />
                  <span className="max-lg:sr-only">
                    {offerComposer.mode === "price"
                      ? "Offer a price"
                      : "Make an offer"}
                  </span>
                </Button>
              ) : null}
              <p
                className={cn(
                  "min-w-0 px-1.5 text-xs tabular-nums",
                  over ? "font-medium text-danger" : "text-subtle",
                  // On a phone only a warning earns the room, on a line of
                  // its own above the row.
                  !over && left >= 400 && "max-sm:hidden",
                  "max-lg:order-0 max-lg:basis-full max-lg:pt-1",
                  !over && left >= 400 && "max-lg:hidden",
                )}
              >
                {over
                  ? `${(draft.length - MAX_MESSAGE).toLocaleString("en-US")} characters too many`
                  : left < 400
                    ? `${left.toLocaleString("en-US")} characters left`
                    : "Up to 25MB"}
              </p>
              <Button
                type="button"
                variant={hasSomething || pending ? "primary" : "secondary"}
                title="Send (Ctrl+Enter)"
                className="ml-auto max-lg:order-3 max-lg:ml-0 max-lg:size-11 max-lg:rounded-full! max-lg:px-0"
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
                <span className="max-lg:sr-only">
                  <BusyLabel busy={pending} idle="Send" working="Sending…" />
                </span>
              </Button>
            </div>
          </div>

          {error ? (
            <p
              role="alert"
              className="mt-2 px-1 text-[0.8125rem] font-medium text-danger"
            >
              {error}
            </p>
          ) : null}
          {note ? (
            <output className="mt-2 flex items-start gap-1.5 px-1 text-xs leading-relaxed text-muted">
              <CircleAlertIcon
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0 text-primary-text"
              />
              <span>{note}</span>
            </output>
          ) : null}
        </div>
      )}
    </div>
  );
}
