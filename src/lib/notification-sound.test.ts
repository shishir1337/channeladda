import { describe, expect, test } from "vitest";
import {
  type ClaimChannel,
  createTabClaimer,
  type KeyValueStore,
  type Pulse,
  type PulseItem,
  SEEN_KEY,
  shouldChime,
  soundIsOn,
  titleWithCount,
  titleWithoutCount,
} from "@/lib/notification-sound";

const T0 = Date.parse("2026-10-26T10:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

function item(
  id: string,
  at: number,
  kind: PulseItem["kind"] = "MESSAGE",
  href: string | null = `/dashboard/messages/${id}`,
): PulseItem {
  return { id, kind, href, at: iso(at) };
}

function pulse(recent: PulseItem[], now = T0 + 60_000): Pulse {
  return {
    unread: recent.length,
    latestId: recent[0]?.id ?? null,
    latestAt: recent[0]?.at ?? null,
    recent,
    now: iso(now),
  };
}

const base = {
  primed: true,
  lastActionAt: null,
  clientNow: T0 + 60_000,
  viewingPath: null,
};

describe("shouldChime", () => {
  test("the first look after a page loads never chimes, and remembers the newest", () => {
    const decision = shouldChime({
      ...base,
      primed: false,
      seenAt: null,
      pulse: pulse([item("a", T0 + 5_000), item("b", T0)]),
    });
    expect(decision.chimeFor).toBeNull();
    expect(decision.fresh).toEqual([]);
    expect(decision.seenAt).toBe(T0 + 5_000);
  });

  test("something newer than anything seen chimes", () => {
    const decision = shouldChime({
      ...base,
      seenAt: T0,
      pulse: pulse([item("b", T0 + 30_000), item("a", T0)]),
    });
    expect(decision.chimeFor?.id).toBe("b");
    expect(decision.fresh.map((n) => n.id)).toEqual(["b"]);
    expect(decision.seenAt).toBe(T0 + 30_000);
  });

  test("nothing newer: silence, and the mark never moves back", () => {
    const decision = shouldChime({
      ...base,
      seenAt: T0 + 30_000,
      pulse: pulse([item("a", T0)]),
    });
    expect(decision.chimeFor).toBeNull();
    expect(decision.seenAt).toBe(T0 + 30_000);
  });

  test("a collapsed thread row keeps its id and still chimes for the next line", () => {
    const decision = shouldChime({
      ...base,
      seenAt: T0,
      pulse: pulse([item("a", T0 + 20_000)]),
    });
    expect(decision.chimeFor?.id).toBe("a");
  });

  test("with nothing unread before, the first new one chimes", () => {
    const decision = shouldChime({
      ...base,
      seenAt: null,
      pulse: pulse([item("a", T0)]),
    });
    expect(decision.chimeFor?.id).toBe("a");
  });

  test("a deal step you just took yourself is not a chime", () => {
    const pressed = T0 + 10_000;
    const decision = shouldChime({
      ...base,
      seenAt: T0,
      lastActionAt: pressed,
      pulse: pulse([item("step", pressed + 1_500, "ORDER")]),
    });
    expect(decision.fresh).toHaveLength(1);
    expect(decision.chimeFor).toBeNull();
  });

  test("…but a message from the other side right after a press still is", () => {
    const pressed = T0 + 10_000;
    const decision = shouldChime({
      ...base,
      seenAt: T0,
      lastActionAt: pressed,
      pulse: pulse([item("msg", pressed + 1_500, "MESSAGE")]),
    });
    expect(decision.chimeFor?.id).toBe("msg");
  });

  test("an own step on top still lets an older new one from somebody else chime", () => {
    const pressed = T0 + 10_000;
    const decision = shouldChime({
      ...base,
      seenAt: T0,
      lastActionAt: pressed,
      pulse: pulse([
        item("step", pressed + 1_000, "ORDER"),
        item("offer", T0 + 5_000, "OFFER", "/dashboard/listings"),
      ]),
    });
    expect(decision.chimeFor?.id).toBe("offer");
  });

  test("the press is lined up with the server's clock, so a slow browser clock is no excuse", () => {
    // The browser runs two minutes behind the server.
    const behind = 120_000;
    const clientNow = T0 + 60_000 - behind;
    const pressedClient = T0 + 10_000 - behind;
    const decision = shouldChime({
      ...base,
      seenAt: T0,
      clientNow,
      lastActionAt: pressedClient,
      pulse: pulse([item("step", T0 + 11_000, "ORDER")], T0 + 60_000),
    });
    expect(decision.chimeFor).toBeNull();
  });

  test("a press long before is not the cause", () => {
    const decision = shouldChime({
      ...base,
      seenAt: T0,
      lastActionAt: T0 + 1_000,
      pulse: pulse([item("step", T0 + 45_000, "ORDER")]),
    });
    expect(decision.chimeFor?.id).toBe("step");
  });

  test("not while you are looking at the page it points to", () => {
    const decision = shouldChime({
      ...base,
      seenAt: T0,
      viewingPath: "/dashboard/messages/c1",
      pulse: pulse([
        item("c1", T0 + 5_000, "MESSAGE", "/dashboard/messages/c1?x=1"),
      ]),
    });
    expect(decision.chimeFor).toBeNull();
    expect(decision.seenAt).toBe(T0 + 5_000);
  });
});

describe("the tab title", () => {
  test("a count goes on the front and comes off the current title", () => {
    expect(titleWithCount("Deals — Channel Adda", 2)).toBe(
      "(2) Deals — Channel Adda",
    );
    expect(titleWithCount("(2) Deals — Channel Adda", 3)).toBe(
      "(3) Deals — Channel Adda",
    );
    expect(titleWithCount("Deals", 140)).toBe("(99+) Deals");
    expect(titleWithoutCount("(99+) Deals")).toBe("Deals");
    expect(titleWithCount("(4) Deals", 0)).toBe("Deals");
  });
});

/** Storage the way a browser shares it between tabs. */
function memoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, String(value));
    },
  };
}

/** A BroadcastChannel stand-in: never to the sender, always a tick later. */
function bus() {
  const listeners: { owner: number; fn: (event: { data: unknown }) => void }[] =
    [];
  let next = 0;
  return () => {
    const owner = next++;
    const channel: ClaimChannel = {
      postMessage(message) {
        for (const l of listeners) {
          if (l.owner !== owner) setTimeout(() => l.fn({ data: message }), 1);
        }
      },
      addEventListener(_type, fn) {
        listeners.push({ owner, fn });
      },
    };
    return channel;
  };
}

const realWait = (ms: number) =>
  new Promise<void>((done) => setTimeout(done, ms));

describe("one tab chimes", () => {
  test("two tabs that notice the same thing at once: exactly one wins", async () => {
    const storage = memoryStore();
    const open = bus();
    const a = createTabClaimer({
      tab: "tab-b",
      channel: open(),
      storage,
      wait: realWait,
      windowMs: 30,
    });
    const b = createTabClaimer({
      tab: "tab-a",
      channel: open(),
      storage,
      wait: realWait,
      windowMs: 30,
    });

    const [first, second] = await Promise.all([a.claim(T0, 1), b.claim(T0, 1)]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(Number(storage.getItem(SEEN_KEY))).toBe(T0);
  });

  test("a tab that looks after another chimed stays quiet", async () => {
    const storage = memoryStore();
    const open = bus();
    const a = createTabClaimer({
      tab: "a",
      channel: open(),
      storage,
      wait: realWait,
      windowMs: 10,
    });
    const b = createTabClaimer({
      tab: "b",
      channel: open(),
      storage,
      wait: realWait,
      windowMs: 10,
    });
    expect(await a.claim(T0, 1)).toBe(true);
    expect(await b.claim(T0, 1)).toBe(false);
    // And the next one is news again.
    expect(await b.claim(T0 + 1, 2)).toBe(true);
  });

  test("with storage blocked, the channel alone still says it was handled", async () => {
    const open = bus();
    const seen: number[] = [];
    const a = createTabClaimer({
      tab: "a",
      channel: open(),
      storage: null,
      wait: realWait,
      windowMs: 10,
    });
    const b = createTabClaimer({
      tab: "b",
      channel: open(),
      storage: null,
      wait: realWait,
      windowMs: 10,
      onSeen: (message) => seen.push(message.unread),
    });
    expect(await a.claim(T0, 3)).toBe(true);
    await realWait(5);
    expect(seen).toEqual([3]);
    expect(await b.claim(T0, 3)).toBe(false);
  });

  test("without a BroadcastChannel, storage holds the claim", async () => {
    const storage = memoryStore();
    const a = createTabClaimer({
      tab: "a",
      channel: null,
      storage,
      wait: realWait,
      windowMs: 20,
    });
    const b = createTabClaimer({
      tab: "b",
      channel: null,
      storage,
      wait: realWait,
      windowMs: 20,
    });
    const results = await Promise.all([a.claim(T0, 1), b.claim(T0, 1)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  test("letting one pass in silence settles it for every tab", async () => {
    const storage = memoryStore();
    const a = createTabClaimer({ tab: "a", channel: null, storage });
    const b = createTabClaimer({
      tab: "b",
      channel: null,
      storage,
      wait: realWait,
      windowMs: 5,
    });
    a.markHandled(T0, 1, false);
    expect(await b.claim(T0, 1)).toBe(false);
  });
});

test("the sound is on unless somebody turned it off, and blocked storage means on", () => {
  const storage = memoryStore();
  expect(soundIsOn(storage)).toBe(true);
  storage.setItem("ca-sound", "off");
  expect(soundIsOn(storage)).toBe(false);
  storage.setItem("ca-sound", "on");
  expect(soundIsOn(storage)).toBe(true);
  const broken: KeyValueStore = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  expect(soundIsOn(broken)).toBe(true);
  expect(soundIsOn(null)).toBe(true);
});
