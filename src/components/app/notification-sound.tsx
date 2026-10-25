"use client";

import { Volume2Icon, VolumeOffIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import {
  ACTION_KEY,
  browserStorage,
  type ClaimChannel,
  createTabClaimer,
  hasNewerThan,
  type Pulse,
  readTime,
  type SeenMessage,
  SOUND_KEY,
  shouldChime,
  soundIsOn,
  type TabClaimer,
  titleWithCount,
  titleWithoutCount,
  writeItem,
} from "@/lib/notification-sound";
import { cn } from "@/lib/utils";

/**
 * A chime when something new arrives, so a member in another tab — or
 * another app — hears it and can answer straight away.
 *
 * Mounted once in each shell: the dashboard and staff area, and the
 * website. The rules for when it sounds live in `@/lib/notification-sound`;
 * this is the browser half — asking, playing, and the tab title.
 */

const PULSE_URL = "/api/notifications/pulse";
/** Every 15 seconds while the tab is on screen, 30 while it is not. */
const VISIBLE_MS = 15_000;
const HIDDEN_MS = 30_000;
/** Focus and visibility often arrive together: one request, not two. */
const MIN_GAP_MS = 2_000;

// ---- what lasts for the whole page, across both shells ---------------------

/**
 * Module state, so moving between the dashboard and the website — two
 * shells, one page load — does not count as a fresh load and swallow a
 * notification that lands on the way.
 */
const page = {
  /** False until the first look since load or sign-in: that never chimes. */
  primed: false,
  /** The newest notification time this tab has accounted for. */
  seenAt: null as number | null,
  /** When a button was last pressed here, if storage is blocked. */
  actedAt: null as number | null,
  tab: newTabId(),
};

function newTabId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    // Falls through to the plain one.
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Signed out: the next account's first look is a first look too. */
function forgetPage() {
  page.primed = false;
  page.seenAt = null;
}

// ---- the sound -------------------------------------------------------------

type AudioContextClass = typeof AudioContext;
let audio: AudioContext | null = null;

/**
 * Browsers keep a page silent until somebody has clicked or typed on it, so
 * the AudioContext is made — or woken — inside one of those events. Until
 * then a chime simply does not play.
 */
function unlockAudio() {
  try {
    if (!audio) {
      const Context =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: AudioContextClass })
          .webkitAudioContext;
      if (!Context) return;
      audio = new Context();
    }
    if (audio.state !== "running") void audio.resume().catch(() => {});
  } catch {
    // No audio here. The title count still works.
  }
}

function hasBeenActive(): boolean {
  try {
    return Boolean(
      (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } })
        .userActivation?.hasBeenActive,
    );
  } catch {
    return false;
  }
}

/** Ready to play, without a click: only if one already woke it. */
async function audioReady(): Promise<boolean> {
  // Clicked before this listener was attached — before the page finished
  // loading, say: the browser already allows sound, so make it now.
  if (!audio && hasBeenActive()) unlockAudio();
  const context = audio;
  if (!context) return false;
  if (context.state !== "running") {
    // `resume` can wait forever for a click that never comes, so it is
    // given a moment, not awaited.
    void context.resume().catch(() => {});
    await new Promise((done) => setTimeout(done, 60));
  }
  return context.state === "running";
}

/**
 * Two rising notes, A5 then E6, a little under 0.4 seconds, each with a
 * quiet octave above it so it rings rather than beeps. Made here, so there
 * is no file to fetch or licence.
 */
function playChime() {
  const context = audio;
  if (context?.state !== "running") return;
  try {
    const start = context.currentTime + 0.02;
    const out = context.createGain();
    out.gain.value = 0.16;
    out.connect(context.destination);

    const notes = [
      { frequency: 880, offset: 0, length: 0.22 },
      { frequency: 1318.51, offset: 0.11, length: 0.28 },
    ];
    const partials = [
      { multiple: 1, level: 1 },
      { multiple: 2, level: 0.12 },
    ];
    let last: OscillatorNode | null = null;
    for (const note of notes) {
      const at = start + note.offset;
      for (const partial of partials) {
        const tone = context.createOscillator();
        tone.type = "sine";
        tone.frequency.value = note.frequency * partial.multiple;
        const envelope = context.createGain();
        envelope.gain.setValueAtTime(0.0001, at);
        envelope.gain.exponentialRampToValueAtTime(partial.level, at + 0.012);
        envelope.gain.exponentialRampToValueAtTime(0.0001, at + note.length);
        tone.connect(envelope);
        envelope.connect(out);
        tone.start(at);
        tone.stop(at + note.length + 0.02);
        last = tone;
      }
    }
    if (last) last.onended = () => out.disconnect();
  } catch {
    // A chime that fails is a chime that did not play; nothing else.
  }
}

// ---- the switch ------------------------------------------------------------

const SOUND_EVENT = "ca-sound-change";
/** Where storage is blocked, the choice lasts for this page instead. */
let soundHere: boolean | null = null;

function currentSound(): boolean {
  return soundHere ?? soundIsOn(browserStorage());
}

function subscribeSound(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === SOUND_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(SOUND_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(SOUND_EVENT, onChange);
  };
}

/** On by default, and before the browser has said otherwise. */
export function useSoundOn(): boolean {
  return useSyncExternalStore(subscribeSound, currentSound, () => true);
}

function changeSound(on: boolean) {
  const stuck = writeItem(browserStorage(), SOUND_KEY, on ? "on" : "off");
  soundHere = stuck ? null : on;
  window.dispatchEvent(new Event(SOUND_EVENT));
  if (on) {
    // The click that turned it on is the click that lets it play: a sample
    // now, so nobody has to wait for a message to know what it sounds like.
    unlockAudio();
    void audioReady().then((ready) => {
      if (ready) playChime();
    });
  }
}

/**
 * "Sound on" / "Sound off". In the bell's panel (`inline`) and on the
 * notifications page (`button`).
 */
export function SoundToggle({
  variant = "inline",
  className,
}: {
  variant?: "inline" | "button";
  className?: string;
}) {
  const on = useSoundOn();
  const Icon = on ? Volume2Icon : VolumeOffIcon;
  const content = (
    <>
      <Icon
        aria-hidden="true"
        className={variant === "inline" ? "size-3.5" : undefined}
      />
      <span className="sr-only">Notification sound: </span>
      {on ? "Sound on" : "Sound off"}
    </>
  );
  const title = on
    ? "A sound plays when something new arrives. Click to turn it off."
    : "No sound when something new arrives. Click to turn it on.";

  if (variant === "button") {
    return (
      <Button
        type="button"
        size="sm"
        variant="secondary"
        data-sound-ignore=""
        title={title}
        onClick={() => changeSound(!on)}
        className={className}
      >
        {content}
      </Button>
    );
  }

  return (
    <button
      type="button"
      data-sound-ignore=""
      title={title}
      onClick={() => changeSound(!on)}
      className={cn(
        "inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg pointer-fine:h-7",
        className,
      )}
    >
      {content}
    </button>
  );
}

// ---- listening -------------------------------------------------------------

function openChannel(): (ClaimChannel & { close(): void }) | null {
  try {
    return typeof BroadcastChannel === "undefined"
      ? null
      : new BroadcastChannel("ca-sound");
  } catch {
    return null;
  }
}

/** A press that might change something: not a menu or a panel opening. */
function isActionPress(event: Event): boolean {
  if (event.type === "submit") return true;
  const target = event.target as Element | null;
  const control = target?.closest?.(
    "button, [role='button'], input[type='submit'], input[type='button']",
  );
  if (!control) return false;
  return !(
    control.closest("[data-sound-ignore]") ||
    control.hasAttribute("aria-haspopup") ||
    control.hasAttribute("aria-expanded")
  );
}

/**
 * Asks, decides and plays until stopped. Outside the component so the
 * React Compiler leaves it alone, and so the state it keeps is plain.
 */
function startListening(refresh: (() => void) | null): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight = false;
  let lastAsked = 0;
  let redrawWaiting = false;
  let counted = false;

  const channel = openChannel();
  const claimer: TabClaimer = createTabClaimer({
    tab: page.tab,
    channel,
    storage: browserStorage(),
    onSeen: (message: SeenMessage) => {
      // Another tab chimed: this one, if hidden, shows the count too.
      if (message.notable && document.visibilityState !== "visible") {
        showCount(message.unread);
      }
    },
  });

  function showCount(unread: number) {
    if (unread <= 0) return clearCount();
    document.title = titleWithCount(document.title, unread);
    counted = true;
  }

  /** Takes the count off whatever the title is now, never a stale copy. */
  function clearCount() {
    if (!counted) return;
    document.title = titleWithoutCount(document.title);
    counted = false;
  }

  function lastPress(): number | null {
    const stored = readTime(browserStorage(), ACTION_KEY);
    if (stored === null) return page.actedAt;
    return page.actedAt === null ? stored : Math.max(stored, page.actedAt);
  }

  async function handle(pulse: Pulse) {
    const visible = document.visibilityState === "visible";
    const mine = page.seenAt;
    const shared = claimer.handledAt();
    const decision = shouldChime({
      primed: page.primed,
      seenAt: mine === null ? shared : Math.max(mine, shared ?? mine),
      pulse,
      lastActionAt: lastPress(),
      clientNow: Date.now(),
      viewingPath: visible && document.hasFocus() ? location.pathname : null,
    });

    // The bell in this tab is drawn by the server: redraw it when anything
    // arrived that this tab had not seen, even if another tab chimed.
    const redraw = page.primed && hasNewerThan(pulse, mine);
    page.primed = true;
    page.seenAt = decision.seenAt;
    if (redraw && refresh) {
      if (visible) refresh();
      else redrawWaiting = true;
    }

    // A count already in the title follows the real one, down to nothing.
    if (counted) showCount(pulse.unread);

    const at = decision.seenAt;
    if (decision.fresh.length === 0 || at === null) return;

    const news = decision.chimeFor !== null;
    if (news && !visible) showCount(pulse.unread);

    if (!news || !currentSound()) {
      // Nothing to hear: settled for every tab, so none of them chimes.
      claimer.markHandled(at, pulse.unread, news);
      return;
    }
    // This tab cannot play yet (nobody has clicked in it): leave it for one
    // that can rather than settling it in silence.
    if (!(await audioReady())) return;
    if (stopped) return;
    if (await claimer.claim(at, pulse.unread)) playChime();
  }

  async function ask() {
    if (stopped || inFlight || Date.now() - lastAsked < MIN_GAP_MS) return;
    inFlight = true;
    lastAsked = Date.now();
    try {
      const response = await fetch(PULSE_URL, { cache: "no-store" });
      if (!response.ok) return;
      const pulse = (await response.json()) as Pulse;
      if (!stopped && Array.isArray(pulse.recent)) await handle(pulse);
    } catch {
      // Offline for a moment. The next tick asks again.
    } finally {
      inFlight = false;
    }
  }

  function schedule() {
    if (stopped) return;
    // A hidden tab's timers are slowed by the browser anyway; asking half
    // as often there keeps a pile of background tabs cheap.
    const delay =
      document.visibilityState === "visible" ? VISIBLE_MS : HIDDEN_MS;
    timer = setTimeout(async () => {
      await ask();
      schedule();
    }, delay);
  }

  function onVisibility() {
    if (document.visibilityState !== "visible") return;
    clearCount();
    if (redrawWaiting && refresh) {
      redrawWaiting = false;
      refresh();
    }
    void ask();
  }

  function onFocus() {
    void ask();
  }

  function onGesture() {
    if (currentSound()) unlockAudio();
  }

  function onPress(event: Event) {
    if (!isActionPress(event)) return;
    const now = Date.now();
    page.actedAt = now;
    writeItem(browserStorage(), ACTION_KEY, String(now));
  }

  const gestures = ["pointerdown", "pointerup", "keydown", "touchend"];
  for (const name of gestures) {
    window.addEventListener(name, onGesture, { capture: true, passive: true });
  }
  document.addEventListener("click", onPress, true);
  document.addEventListener("submit", onPress, true);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("focus", onFocus);

  void ask();
  schedule();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    for (const name of gestures) {
      window.removeEventListener(name, onGesture, { capture: true });
    }
    document.removeEventListener("click", onPress, true);
    document.removeEventListener("submit", onPress, true);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("focus", onFocus);
    clearCount();
    try {
      channel?.close();
    } catch {
      // Already closed.
    }
  };
}

/**
 * The listener. `enabled` is "somebody is signed in"; `redrawBell` is for
 * the dashboard, whose bell is drawn by the server and would otherwise say
 * nothing new under a chime that just said otherwise.
 */
export function NotificationSound({
  enabled,
  redrawBell = false,
}: {
  enabled: boolean;
  redrawBell?: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;
    return startListening(redrawBell ? () => router.refresh() : null);
  }, [enabled, redrawBell, router]);

  return null;
}

/** The website's: its pages are static, so who is signed in comes from here. */
export function SiteNotificationSound() {
  const { data: session, isPending } = useSession();
  const signedIn = Boolean(session?.user);

  useEffect(() => {
    if (!isPending && !signedIn) forgetPage();
  }, [isPending, signedIn]);

  return <NotificationSound enabled={signedIn} />;
}
