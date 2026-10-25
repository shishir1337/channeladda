"use client";

import {
  ChevronDownIcon,
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
  StoreIcon,
  TagIcon,
  XIcon,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Fragment,
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
import type { OfferComposerConfig } from "@/components/messages/offer-composer";
import { OfferActions } from "@/components/offers/offer-actions";
import { Button } from "@/components/ui/button";
import { iconText } from "@/components/ui/icon-hue";
import { money } from "@/lib/chat-events";
import { chatTime } from "@/lib/chat-time";
import { fileSize } from "@/lib/file-size";
import { MAX_MESSAGE } from "@/lib/messages";
import { removedNote } from "@/lib/redact";
import { cn } from "@/lib/utils";
import {
  type MessageActionResult,
  postMessage,
} from "@/server/actions/messages";

/**
/**
 * The offer form opens only when somebody presses Offer, so its code is not
 * part of the chat's first load — the slowest page on a phone — and is
 * fetched on hover or focus of the button, before the press.
 */
const loadOfferComposer = () =>
  import("@/components/messages/offer-composer").then(
    (module) => module.OfferComposerForm,
  );
const OfferComposerForm = dynamic(loadOfferComposer, { ssr: false });

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
  /** The listing it is about. Null in the Escrow Agent chat. */
  listingId: string | null;
  /** The first line of a deal: "opened a Safest deal". */
  opensDeal: boolean;
  body: string;
  createdAt: string;
  mine: boolean;
  fromStaff: boolean;
  senderName: string;
  senderRole: "buyer" | "seller" | "staff" | "agent" | "system";
  /** The buyer's or the seller's public page, when they have one. */
  senderHref: string | null;
  /** Set on an offer card only. */
  offer: ThreadOfferView | null;
  redactedKinds: string | null;
  attachmentUrl: string | null;
  attachmentKind: "IMAGE" | "VIDEO" | null;
  /** Null once the file has been deleted, which happens after 48 hours. */
  attachmentExpiresAt: string | null;
  attachmentRemoved: boolean;
  /** A deal here is running: the file stays until every deal has ended. */
  attachmentKeptForDeal?: boolean;
};

/** One listing a conversation is about, as the thread draws it. */
export type ThreadListingView = {
  id: string;
  slug: string;
  title: string;
  priceCents: number;
  /** Its public page exists: on sale or reserved. */
  onSale: boolean;
  /** The newest deal on it in this conversation. */
  dealReference: string | null;
};

/** The thread opened on one listing, from wherever it is now. */
function aboutHref(pathname: string, listingId: string) {
  return `${pathname}?about=${encodeURIComponent(listingId)}`;
}

/** A link in a divider: small words, a finger-sized target. */
const DIVIDER_LINK =
  "inline-flex min-h-11 items-center rounded-md px-2 text-xs font-medium text-muted underline-offset-4 transition-colors duration-150 hover:text-fg hover:underline pointer-fine:min-h-7";

/**
 * Where the conversation turns to another listing: "About: Gaming channel ·
 * $2,500.00". A conversation is the two people, so it carries everything
 * they have talked about; this is how the reader tells which part is about
 * what. "View listing" opens its page while it has one; "Show deal" (or,
 * with no deal on it, "Talk about this") turns the page to it.
 */
function ListingDivider({
  listing,
  focused,
}: {
  listing: ThreadListingView;
  focused: boolean;
}) {
  const pathname = usePathname();
  return (
    <li className="flex flex-col items-center pt-1">
      <div className="flex w-full items-center gap-3">
        <span aria-hidden="true" className="h-px min-w-4 flex-1 bg-line" />
        <p className="flex max-w-[calc(100%-3rem)] min-w-0 items-center gap-1.5 text-xs text-muted">
          <StoreIcon
            aria-hidden="true"
            className={cn("size-3.5 shrink-0", iconText(StoreIcon))}
          />
          <span className="truncate">
            About: <span className="font-medium text-fg">{listing.title}</span>
          </span>
          <span className="shrink-0 text-subtle tabular-nums">
            · {money(listing.priceCents)}
          </span>
        </p>
        <span aria-hidden="true" className="h-px min-w-4 flex-1 bg-line" />
      </div>
      {listing.onSale || !focused ? (
        <div className="-mb-2 flex items-center">
          {listing.onSale ? (
            <Link href={`/listing/${listing.slug}`} className={DIVIDER_LINK}>
              View listing
            </Link>
          ) : null}
          {!focused ? (
            <Link
              href={aboutHref(pathname, listing.id)}
              replace
              scroll={false}
              className={DIVIDER_LINK}
            >
              {listing.dealReference ? "Show deal" : "Talk about this"}
            </Link>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * What a message written now is about, over the message box. With one
 * listing it only says so; with more it switches between them, turning the
 * whole page — header, deal panel, offer box — to the one chosen. A native
 * picker underneath, because on a phone that is the system's own list.
 */
function AboutChip({
  listings,
  value,
  onChange,
}: {
  listings: ThreadListingView[];
  value: string;
  onChange: (listingId: string) => void;
}) {
  const current = listings.find((listing) => listing.id === value);
  if (!current) return null;
  const chip =
    "relative mb-1.5 inline-flex min-h-11 max-w-full min-w-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[0.8125rem] text-muted pointer-fine:min-h-8 dark:bg-surface-2";
  const label = (
    <>
      <StoreIcon
        aria-hidden="true"
        className={cn("size-3.5 shrink-0", iconText(StoreIcon))}
      />
      <span className="truncate">
        About: <span className="font-medium text-fg">{current.title}</span>
      </span>
    </>
  );
  if (listings.length < 2) return <p className={chip}>{label}</p>;
  return (
    <label
      className={cn(
        chip,
        "cursor-pointer transition-[border-color,box-shadow] duration-150 hover:border-line-strong has-[select:focus-visible]:border-primary has-[select:focus-visible]:ring-[3px] has-[select:focus-visible]:ring-primary/20",
      )}
    >
      {label}
      <ChevronDownIcon
        aria-hidden="true"
        className="size-3.5 shrink-0 text-subtle"
      />
      <select
        aria-label="What this message is about"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
      >
        {listings.map((listing) => (
          <option key={listing.id} value={listing.id}>
            {listing.title}
          </option>
        ))}
      </select>
    </label>
  );
}

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
      {message.attachmentKeptForDeal ? (
        // The real rule in a deal's conversation: evidence stays while the
        // deal can still be disputed.
        <figcaption className="mt-1.5 flex items-center gap-1.5 text-xs text-subtle">
          <ClockIcon aria-hidden="true" className="size-3" />
          Kept while the deal runs; removed after it ends
        </figcaption>
      ) : left ? (
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

/**
 * Which box the conversation scrolls in: the message list itself in the
 * window-height view, the page everywhere else (a phone, a narrow pane),
 * where the list simply grows with the conversation.
 */
function listScrolls(list: HTMLElement) {
  return (
    getComputedStyle(list).overflowY !== "visible" &&
    list.scrollHeight > list.clientHeight + 1
  );
}

/** The box the conversation scrolls in, as `listScrolls` decides. */
function scrollingBox(list: HTMLElement) {
  return listScrolls(list)
    ? list
    : (document.scrollingElement ?? document.documentElement);
}

/**
 * How far the end of the conversation — the message box — is below the
 * bottom of the screen, in pixels; negative once the page is scrolled past
 * it. On the page that is the chat's own end, not the page's: on the staff
 * desk the controls follow it on a phone.
 */
function distanceFromEnd(list: HTMLElement) {
  if (listScrolls(list)) {
    return list.scrollHeight - list.scrollTop - list.clientHeight;
  }
  const end = (list.parentElement ?? list).getBoundingClientRect().bottom;
  return end - document.documentElement.clientHeight;
}

/**
 * Shows the newest message, just above the message box. Instant, not the
 * page's smooth scrolling: a smooth scroll started before a message is drawn
 * stops where the end used to be, leaving the new one under the box.
 */
function scrollToEnd(list: HTMLElement) {
  if (listScrolls(list)) {
    list.scrollTop = list.scrollHeight;
    return;
  }
  const by = distanceFromEnd(list);
  if (Math.abs(by) >= 1) {
    window.scrollTo({ top: window.scrollY + by, behavior: "instant" });
  }
}

/**
 * Grows the message box with what is typed in a browser without
 * `field-sizing: content`, which does it in CSS everywhere else. The cap,
 * and scrolling inside the box past it, are the textarea's own CSS.
 */
function fitToText(box: HTMLTextAreaElement | null) {
  if (!box || CSS.supports("field-sizing", "content")) return;
  box.style.height = "auto";
  box.style.height = `${box.scrollHeight}px`;
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
              ) : !message.mine && message.senderHref ? (
                <Link
                  href={message.senderHref}
                  className="rounded-sm font-medium text-muted underline-offset-4 transition-colors duration-150 hover:text-fg hover:underline"
                >
                  {displayName(message)}
                </Link>
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
                  <span>{removedNote(message.redactedKinds.split(", "))}</span>
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
  listings = [],
  focusListingId = null,
  messages,
  closed,
  otherSide,
  viewerRole,
  offerComposer = null,
  after = null,
  sendWith = null,
  notice = null,
  empty = null,
  footnote = null,
}: {
  conversationId: string;
  /**
   * Every listing the conversation is about, as the reader may see them.
   * With two or more, the lines are divided by listing.
   */
  listings?: ThreadListingView[];
  /** The listing the page is about, and a line written here is about. */
  focusListingId?: string | null;
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
  /**
   * The server action a line is sent with, for a chat that is not a deal
   * conversation — the Escrow Agent. Left out, it is `postMessage` into
   * `conversationId`.
   */
  sendWith?:
    | ((body: string, attachmentKey?: string) => Promise<MessageActionResult>)
    | null;
  /** The line above the first message, in place of the deal-chat one. */
  notice?: ReactNode;
  /** What an empty chat says, in place of the deal-chat one. */
  empty?: { title: string; body: string } | null;
  /**
   * A line under the message box, inside it, so it stays with the box at
   * the bottom of the screen — the staff desk's "sent as Channel Adda".
   */
  footnote?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  // What the next line is about. Follows the page's focus, and changes the
  // moment the reader picks another listing, before the page has turned —
  // a line typed in between is about what they chose.
  const [about, setAbout] = useState(focusListingId);
  const [aboutFrom, setAboutFrom] = useState(focusListingId);
  if (aboutFrom !== focusListingId) {
    setAboutFrom(focusListingId);
    setAbout(focusListingId);
  }

  // The listing the page opened on goes into the address, without a trip
  // to the server. Left out, each refresh — the reader's own line landing,
  // or the other side's arriving with the live refresh — chose the focus
  // again, and could turn the page, and the line being typed, to another
  // listing.
  const ownSend = sendWith !== null;
  useEffect(() => {
    if (!focusListingId || ownSend) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("about") === focusListingId) return;
    params.set("about", focusListingId);
    // A tick later: on a fresh load this effect runs before the router's
    // own, which is what teaches it about replaceState — and a message sent
    // then went to the address without the listing in it.
    const timer = window.setTimeout(() => {
      window.history.replaceState(null, "", `${pathname}?${params}`);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [focusListingId, ownSend, pathname]);
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
  const textRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  /** Whether the reader is following the newest message. */
  const following = useRef(true);

  // Land on the newest message, the way every other chat does — and stay
  // there whenever anything changes size while the reader is at the end: a
  // message sent or arriving with the live refresh, a photo loading, the
  // message box growing or emptying. Whichever box scrolls — the list in the
  // window-height view, the page elsewhere — follows. The content is watched
  // as one wrapper, so a list that did not exist when the chat opened (the
  // first message) is still seen. Someone who has scrolled up to read is
  // left exactly where they are.
  //
  // Only scrolling up lets go of the end. The browser fires scroll events
  // of its own when a layout change moves the end — a sent message landing
  // in the same frame as the box emptying — and judging "still at the end?"
  // from those let go before the observer could follow, leaving the new
  // message under the box.
  useEffect(() => {
    const root = rootRef.current;
    const list = scrollerRef.current;
    const content = contentRef.current;
    if (!root || !list || !content) return;

    scrollToEnd(list);

    let lastTop = scrollingBox(list).scrollTop;
    const onScroll = () => {
      const top = scrollingBox(list).scrollTop;
      const distance = distanceFromEnd(list);
      if (Math.abs(distance) < 80) following.current = true;
      // Scrolled up to read, or on down past the chat to what follows it.
      else if (top < lastTop || distance < 0) following.current = false;
      lastTop = top;
    };
    const keepAtEnd = () => {
      if (following.current) scrollToEnd(list);
    };
    const observer = new ResizeObserver(keepAtEnd);
    observer.observe(root);
    observer.observe(list);
    observer.observe(content);
    list.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      list.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Lines are divided by listing only when there is more than one.
  const divided = listings.length > 1;
  const byListing = new Map(listings.map((listing) => [listing.id, listing]));
  /** The listing the line at `index` turns the conversation to, if any. */
  const turnsTo = (index: number): string | null => {
    const listingId = messages[index]?.listingId ?? null;
    if (!divided || !listingId) return null;
    return messages[index - 1]?.listingId === listingId ? null : listingId;
  };

  function choose(listingId: string) {
    setAbout(listingId);
    router.replace(aboutHref(pathname, listingId), { scroll: false });
  }

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
    // Whoever sends wants to see what they sent. No scroll here: the new
    // message is not drawn until the action's refresh lands, and the
    // observer above takes the conversation to it once it is.
    following.current = true;
    startTransition(async () => {
      const result = sendWith
        ? await sendWith(body, attachment?.key)
        : about
          ? await postMessage(conversationId, about, body, attachment?.key)
          : { ok: false as const, error: "Pick what this message is about." };
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDraft("");
      // Back to one line where the browser does not size the box itself.
      if (textRef.current) textRef.current.style.height = "";
      if (attachment) URL.revokeObjectURL(attachment.url);
      setAttachment(null);
      setNote(result.note);
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
    <div ref={rootRef} className="flex min-h-0 flex-1 flex-col">
      {/* The conversation, taking all the room above the message box, so
          the box is always last. In the window-height view (chat-layout)
          only this scrolls; on a phone and in a narrow pane it grows with
          the conversation and the page scrolls instead. */}
      {/* `relative` makes it the box its absolutely placed pieces — the
          bubbles' screen-reader names — are laid out in. Without it they
          escaped the list's scroll: each one under the fold stretched the
          page below the window, so the page itself could scroll, carrying
          the message box up and leaving empty space under it. */}
      <div
        ref={scrollerRef}
        className="relative flex flex-1 flex-col lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:pr-2 lg:[scrollbar-width:thin]"
      >
        {/* Pushed to the bottom when the chat is shorter than the room, as
            in every messaging app: the newest message sits just above the
            box you answer it in, not at the top with a gap under it. The
            bottom padding is the strip the box's fade covers. */}
        <div ref={contentRef} className="mt-auto pb-4">
          {/* A quiet line rather than a box: it is read once, before the first
          message, and should not compete with the conversation after that.
          One line on screen; the rule itself, word for word, behind the (i). */}
          {notice ?? (
            <p className="mx-auto flex max-w-[66ch] items-center gap-2 px-1 text-xs leading-relaxed text-muted">
              <EyeIcon
                aria-hidden="true"
                className="size-3.5 shrink-0 text-subtle"
              />
              <span>Channel Adda can see this chat, to keep you safe.</span>
              <InfoTip label="About this chat">
                Channel Adda can read this conversation and will step in if
                something goes wrong. Phone numbers, emails and links are
                removed automatically. Photos and clips are deleted after 48
                hours, and messages about a listing with no deal clear after 10
                days.
              </InfoTip>
            </p>
          )}

          {messages.length === 0 ? (
            <EmptyState
              bare
              className="py-14"
              icon={MessageSquareIcon}
              title={empty?.title ?? "No messages yet"}
              body={
                empty?.body ??
                `Ask ${otherSide} whatever you need to know before you commit — revenue, where the traffic comes from, strikes, why they are selling.`
              }
            />
          ) : (
            <ul className="mt-6 flex flex-col gap-5">
              {messages.map((message, index) => {
                const prev = messages[index - 1];
                const next = messages[index + 1];
                const divider = turnsTo(index);
                const listing = divider ? byListing.get(divider) : undefined;
                const item =
                  message.kind === "EVENT" ? (
                    <EventLine
                      key={message.id}
                      message={message}
                      // A run of history lines reads as one block of record.
                      className={
                        prev?.kind === "EVENT" && !divider ? "-mt-3" : undefined
                      }
                      // The line that opened a deal turns the page to it.
                      action={
                        message.opensDeal &&
                        divided &&
                        message.listingId &&
                        message.listingId !== about
                          ? {
                              href: aboutHref(pathname, message.listingId),
                              label: "Show deal",
                            }
                          : null
                      }
                    />
                  ) : message.kind === "OFFER" && message.offer ? (
                    <ChatOfferCard
                      key={message.id}
                      offer={message.offer}
                      viewerRole={viewerRole}
                      senderName={message.mine ? "You" : displayName(message)}
                      senderHref={message.mine ? null : message.senderHref}
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
                      first={
                        !prev || divider !== null || !sameTurn(prev, message)
                      }
                      last={
                        !next ||
                        turnsTo(index + 1) !== null ||
                        !sameTurn(message, next)
                      }
                    />
                  );
                return listing ? (
                  <Fragment key={message.id}>
                    <ListingDivider
                      listing={listing}
                      focused={listing.id === about}
                    />
                    {item}
                  </Fragment>
                ) : (
                  item
                );
              })}
            </ul>
          )}
          {after ? <div className="mt-6">{after}</div> : null}
        </div>
      </div>

      {closed ? (
        <p className="mt-2 mb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-start justify-center gap-2 rounded-card border border-line bg-surface-2/60 px-4 py-3 text-[0.8125rem] leading-relaxed text-muted lg:mb-6">
          <LockIcon
            aria-hidden="true"
            className={`mt-0.5 size-3.5 shrink-0 ${iconText(LockIcon)}`}
          />
          <span>
            Channel Adda closed this conversation. Nothing further can be sent.
          </span>
        </p>
      ) : (
        // The last thing on the screen at every size. In the window-height
        // view it is simply the column's last row. Where the page scrolls
        // instead, `sticky` holds it at the bottom while the conversation
        // passes under it, and the page is never shorter than the screen
        // (chat-layout), so it cannot ride up a short chat over empty page.
        // Not `fixed`: that is measured from the nearest ancestor with a
        // transform, filter or container query rather than the screen, and
        // has been moved by each of those before. On a phone it runs edge to
        // edge, and is capped so an open offer form scrolls inside it rather
        // than pushing its top off screen.
        <div className="sticky bottom-0 z-10 -mx-3 border-t border-line bg-bg/95 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl max-lg:max-h-[70dvh] max-lg:overflow-y-auto max-lg:overscroll-contain sm:-mx-6 sm:px-6 lg:mx-0 lg:border-t-0 lg:bg-bg lg:px-0 lg:pt-2 lg:pb-6 lg:backdrop-blur-none lg:before:pointer-events-none lg:before:absolute lg:before:inset-x-0 lg:before:bottom-full lg:before:h-4 lg:before:bg-linear-to-t lg:before:from-bg lg:before:to-transparent">
          {about && listings.length > 0 ? (
            <AboutChip listings={listings} value={about} onChange={choose} />
          ) : null}
          {offering && offerComposer ? (
            <OfferComposerForm
              config={offerComposer}
              onDone={() => setOffering(false)}
            />
          ) : null}

          {/* One row — attach, offer, the text, send — and one line of text
              until more is typed, so the box takes a line of the screen
              rather than a block of it. It grows to about six lines, then
              scrolls inside. Touch keeps 44px targets and 16px text (iOS
              zooms into anything smaller); a mouse gets the kit's 36px. */}
          <div className="@container/composer flex flex-wrap items-end gap-0.5 rounded-[1.375rem] border border-line bg-surface p-1 shadow-xs transition-[border-color,box-shadow] duration-150 not-focus-within:hover:border-line-strong focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/20 has-[[aria-invalid=true]]:border-danger has-[[aria-invalid=true]]:ring-danger/15 lg:rounded-card dark:bg-surface-2">
            <label htmlFor="composer" className="sr-only">
              Write a message
            </label>
            <textarea
              ref={textRef}
              id="composer"
              rows={1}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                fitToText(event.currentTarget);
              }}
              onKeyDown={(event) => {
                // On a computer Enter sends and Shift+Enter starts a new
                // line, as in every chat; on a phone Enter is the new line
                // and Send is the button. Not mid-word in an input method,
                // where Enter picks the word.
                if (event.key !== "Enter" || event.nativeEvent.isComposing) {
                  return;
                }
                const sends =
                  event.metaKey ||
                  event.ctrlKey ||
                  (!event.shiftKey &&
                    window.matchMedia("(pointer: fine)").matches);
                if (!sends) return;
                event.preventDefault();
                if (!pending && !uploading) send();
              }}
              placeholder="Write a message…"
              aria-invalid={over}
              className="order-2 block max-h-39 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-2 py-2.5 text-base leading-6 field-sizing-content text-fg placeholder:text-subtle focus:outline-none pointer-fine:min-h-9 pointer-fine:py-1.5 pointer-fine:text-sm"
            />

            {attachment ? (
              <div className="order-0 mb-0.5 flex basis-full items-center gap-3 rounded-lg border border-line bg-surface-2 p-2">
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
                    {fileSize(attachment.bytes)} · deleted
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

            <div className="contents">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
                className="sr-only"
                id="attach"
                aria-label="Attach a photo or video"
                // The button beside it opens it; one stop on the way
                // through, not two.
                tabIndex={-1}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                }}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                title="Photo or clip, up to 25MB"
                className="order-1"
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
                  // Words only where they leave the text a real width: in
                  // the deal chat's narrow column beside the panel, the tag
                  // alone, as on a phone.
                  className="order-1 aria-expanded:bg-surface-2 aria-expanded:text-fg max-lg:size-11 max-lg:px-0 lg:@max-xl/composer:aspect-square lg:@max-xl/composer:px-0!"
                >
                  <TagIcon aria-hidden="true" className="size-4" />
                  <span className="max-lg:sr-only lg:@max-xl/composer:sr-only">
                    {offerComposer.mode === "price"
                      ? "Offer a price"
                      : "Make an offer"}
                  </span>
                </Button>
              ) : null}
              {/* Only near the limit, on a line of its own above the row. */}
              {over || left < 400 ? (
                <p
                  className={cn(
                    "order-0 basis-full px-2 pt-1 text-xs tabular-nums",
                    over ? "font-medium text-danger" : "text-subtle",
                  )}
                >
                  {over
                    ? `${(draft.length - MAX_MESSAGE).toLocaleString("en-US")} characters too many`
                    : `${left.toLocaleString("en-US")} characters left`}
                </p>
              ) : null}
              <Button
                type="button"
                variant={hasSomething || pending ? "primary" : "secondary"}
                title="Send (Enter)"
                className="order-3 max-lg:size-11 max-lg:rounded-full! max-lg:px-0"
                disabled={
                  pending ||
                  uploading ||
                  over ||
                  onPointerEnter={() => void loadOfferComposer()}
                  onFocus={() => void loadOfferComposer()}
                  (draft.trim().length === 0 && attachment === null)
                }
                // Keeps the cursor in the box. Tapping Send moved focus off
                // it, which on a phone drops the keyboard — and the screen
                // jumped with it after every message.
                onMouseDown={(event) => event.preventDefault()}
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
          {/* What Enter does, with a mouse and keyboard only: on a phone
              Enter is a new line, and the hint would be wrong. Out of the
              way while a note or an error says something more useful. */}
          {!error && !note ? (
            <p className="mt-1.5 hidden px-1 text-xs text-subtle pointer-fine:block">
              Enter to send, Shift+Enter for a new line
            </p>
          ) : null}
          {footnote ? (
            <p className="mt-2 px-1 text-xs leading-relaxed text-subtle">
              {footnote}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
