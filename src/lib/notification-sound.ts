import type { NotificationKind } from "@/generated/prisma/enums";

/**
 * The chime: what decides it, kept apart from the browser so it can be
 * tested.
 *
 * A notification row is written for everything addressed to somebody — a
 * line in a chat (collapsed per thread, never to the person who wrote it),
 * an offer, a deal step, a payout, an ID check for the desk. The browser
 * asks `/api/notifications/pulse` for the newest few unread and chimes when
 * one is newer than anything already accounted for. Three things keep it
 * quiet: the first look after a page loads (everything then is old news),
 * something the person caused themselves, and the very page it points at
 * being the one they are looking at.
 */

export type PulseItem = {
  id: string;
  kind: NotificationKind;
  href: string | null;
  /** When it last changed: a collapsed row moves forward with each line. */
  at: string;
};

export type Pulse = {
  unread: number;
  latestId: string | null;
  latestAt: string | null;
  /** The newest few unread, newest first. */
  recent: PulseItem[];
  /** The server's clock, so the browser can line its own up with `at`. */
  now: string;
};

export function emptyPulse(now: string): Pulse {
  return { unread: 0, latestId: null, latestAt: null, recent: [], now };
}

/**
 * How long after somebody presses a button a notification can be the
 * result of it. A deal step that is your move again, a deal you closed
 * yourself: those arrive within a second or two of the press.
 */
export const OWN_ACTION_MS = 10_000;

export function timeOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  return Number.isFinite(time) ? time : null;
}

function later(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

/** The path a notification opens, without its query or fragment. */
export function pathOf(href: string): string {
  if (/^https?:/i.test(href)) {
    try {
      return new URL(href).pathname;
    } catch {
      return href;
    }
  }
  return href.split(/[?#]/)[0] ?? href;
}

/**
 * Caused by the person hearing it.
 *
 * The server does not record who caused a notification, so this is the
 * browser's own account of it: a button pressed in this browser just before
 * the row was written. Messages never count — a line in a chat is never
 * sent to the person who wrote it, and it is the one thing that must always
 * be heard.
 */
export function isOwnAction(
  item: Pick<PulseItem, "kind">,
  at: number,
  actedAt: number | null,
): boolean {
  if (item.kind === "MESSAGE" || actedAt === null) return false;
  // A second of slack before the press, for the two clocks being lined up
  // from one request.
  return at >= actedAt - 1_000 && at <= actedAt + OWN_ACTION_MS;
}

export type ChimeInput = {
  /** False for the first look after the page loaded: never a chime. */
  primed: boolean;
  /** The newest time already accounted for, by this tab or another. */
  seenAt: number | null;
  pulse: Pulse;
  /** When a button was last pressed in this browser, by its clock. */
  lastActionAt: number | null;
  /** This browser's clock when the pulse arrived. */
  clientNow: number;
  /** The path on screen, only while the tab is visible and focused. */
  viewingPath: string | null;
};

export type ChimeDecision = {
  /** Newer than `seenAt`, newest first. Empty on the first look. */
  fresh: PulseItem[];
  /** The newest fresh one worth a sound, if any. */
  chimeFor: PulseItem | null;
  /** What `seenAt` becomes. */
  seenAt: number | null;
};

export function shouldChime(input: ChimeInput): ChimeDecision {
  const dated = input.pulse.recent
    .map((item) => ({ item, at: timeOf(item.at) }))
    .filter((entry): entry is { item: PulseItem; at: number } => {
      return entry.at !== null;
    })
    .sort((a, b) => b.at - a.at);

  const seenAt = later(input.seenAt, dated[0]?.at ?? null);
  if (!input.primed) return { fresh: [], chimeFor: null, seenAt };

  const fresh = dated.filter(
    (entry) => input.seenAt === null || entry.at > input.seenAt,
  );

  // The press was timed by this browser and the row by the server: shift
  // the press onto the server's clock before comparing them.
  const skew = (timeOf(input.pulse.now) ?? input.clientNow) - input.clientNow;
  const actedAt =
    input.lastActionAt === null ? null : input.lastActionAt + skew;

  const worth = fresh.find(
    ({ item, at }) =>
      !isOwnAction(item, at, actedAt) &&
      !(
        input.viewingPath !== null &&
        item.href !== null &&
        pathOf(item.href) === input.viewingPath
      ),
  );

  return {
    fresh: fresh.map((entry) => entry.item),
    chimeFor: worth?.item ?? null,
    seenAt,
  };
}

/** Anything in the pulse newer than `since`, for redrawing the bell. */
export function hasNewerThan(pulse: Pulse, since: number | null): boolean {
  return pulse.recent.some((item) => {
    const at = timeOf(item.at);
    return at !== null && (since === null || at > since);
  });
}

// ---- the tab title --------------------------------------------------------

const COUNT_PREFIX = /^\(\d+\+?\) /;

/** "(2) Deals — Channel Adda", from whatever the title is now. */
export function titleWithCount(title: string, count: number): string {
  const bare = titleWithoutCount(title);
  if (count <= 0) return bare;
  return `(${count > 99 ? "99+" : count}) ${bare}`;
}

export function titleWithoutCount(title: string): string {
  return title.replace(COUNT_PREFIX, "");
}

// ---- storage ---------------------------------------------------------------

export type KeyValueStore = Pick<Storage, "getItem" | "setItem">;

/** `localStorage`, or null where it is blocked or there is no window. */
export function browserStorage(): KeyValueStore | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readItem(
  storage: KeyValueStore | null,
  key: string,
): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/** True when the value stuck. */
export function writeItem(
  storage: KeyValueStore | null,
  key: string,
  value: string,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return storage.getItem(key) === value;
  } catch {
    return false;
  }
}

/** On unless somebody turned it off, per browser. */
export const SOUND_KEY = "ca-sound";
/** The newest notification time any tab has chimed for or let pass. */
export const SEEN_KEY = "ca-sound-seen";
/** When a button was last pressed, in any tab. */
export const ACTION_KEY = "ca-sound-acted";
/** The claim on the next chime, where there is no BroadcastChannel. */
export const CLAIM_KEY = "ca-sound-claim";

export function soundIsOn(storage: KeyValueStore | null): boolean {
  return readItem(storage, SOUND_KEY) !== "off";
}

export function readTime(
  storage: KeyValueStore | null,
  key: string,
): number | null {
  const value = Number(readItem(storage, key));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Moves a stored time forward, never back. */
export function advanceTime(
  storage: KeyValueStore | null,
  key: string,
  at: number,
): void {
  const stored = readTime(storage, key);
  if (stored === null || at > stored) writeItem(storage, key, String(at));
}

// ---- one tab chimes --------------------------------------------------------

/** The part of BroadcastChannel this needs, so a test can stand one in. */
export type ClaimChannel = {
  postMessage(message: unknown): void;
  addEventListener(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void;
};

export type SeenMessage = {
  t: "seen";
  at: number;
  unread: number;
  /** Somebody else's news, worth a count in a hidden tab's title. */
  notable: boolean;
};

type ClaimMessage = { t: "claim"; at: number; tab: string } | SeenMessage;

/** How long a tab waits for another to say it is chiming too. */
export const CLAIM_WINDOW_MS = 250;

/**
 * With the site open in four tabs, one chime, not four.
 *
 * Every tab that can play asks for each new notification time. Over a
 * BroadcastChannel: a tab that has already heard a claim for that time
 * stands aside; tabs whose claims crossed in flight all pick the same
 * winner — the smallest tab id — after a short wait. Without one,
 * `localStorage` holds the claim and the last writer wins. Either way the
 * winner records the time, so a tab that looks later knows it is old news.
 */
export function createTabClaimer(options: {
  tab: string;
  channel: ClaimChannel | null;
  storage: KeyValueStore | null;
  wait?: (ms: number) => Promise<void>;
  windowMs?: number;
  onSeen?: (message: SeenMessage) => void;
}) {
  const { tab, channel, storage } = options;
  const wait =
    options.wait ??
    ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  const windowMs = options.windowMs ?? CLAIM_WINDOW_MS;
  const claims = new Map<number, Set<string>>();
  // Heard over the channel, for a browser where storage is blocked.
  let heardAt: number | null = null;

  function handledAt(): number | null {
    return later(heardAt, readTime(storage, SEEN_KEY));
  }

  function noteClaim(at: number, by: string) {
    const set = claims.get(at) ?? new Set<string>();
    set.add(by);
    claims.set(at, set);
  }

  channel?.addEventListener("message", (event) => {
    const message = event.data as ClaimMessage | null;
    if (!message || typeof message !== "object") return;
    if (message.t === "claim" && typeof message.at === "number") {
      noteClaim(message.at, String(message.tab));
    } else if (message.t === "seen" && typeof message.at === "number") {
      heardAt = later(heardAt, message.at);
      options.onSeen?.(message);
    }
  });

  /** Records `at` as dealt with, here and in every other tab. */
  function markHandled(at: number, unread: number, notable: boolean) {
    heardAt = later(heardAt, at);
    advanceTime(storage, SEEN_KEY, at);
    channel?.postMessage({ t: "seen", at, unread, notable } as SeenMessage);
    for (const key of claims.keys()) if (key <= at) claims.delete(key);
  }

  function already(at: number): boolean {
    const done = handledAt();
    return done !== null && done >= at;
  }

  /** True for the one tab that should play the chime for `at`. */
  async function claim(at: number, unread: number): Promise<boolean> {
    if (already(at)) return false;

    if (channel) {
      const others = [...(claims.get(at) ?? [])].filter((id) => id !== tab);
      // Somebody claimed it before this tab even looked: theirs.
      if (others.length > 0) return false;
      noteClaim(at, tab);
      channel.postMessage({ t: "claim", at, tab } as ClaimMessage);
      await wait(windowMs);
      if (already(at)) return false;
      const [winner] = [...(claims.get(at) ?? [])].sort();
      if (winner !== tab) return false;
    } else if (storage) {
      const current = parseClaim(readItem(storage, CLAIM_KEY));
      if (current && current.at === at && current.tab !== tab) return false;
      writeItem(storage, CLAIM_KEY, JSON.stringify({ at, tab }));
      await wait(windowMs);
      const still = parseClaim(readItem(storage, CLAIM_KEY));
      if (still && (still.at !== at || still.tab !== tab)) return false;
      if (already(at)) return false;
    }

    markHandled(at, unread, true);
    return true;
  }

  return { claim, markHandled, handledAt };
}

export type TabClaimer = ReturnType<typeof createTabClaimer>;

function parseClaim(raw: string | null): { at: number; tab: string } | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { at?: unknown; tab?: unknown };
    return typeof value.at === "number" && typeof value.tab === "string"
      ? { at: value.at, tab: value.tab }
      : null;
  } catch {
    return null;
  }
}
