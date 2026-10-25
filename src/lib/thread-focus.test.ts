import { expect, test } from "vitest";
import type { PanelState } from "@/lib/deal-panel";
import { isYourMove, pickFocus, tabsFor } from "@/lib/thread-focus";

const listings = [{ id: "a" }, { id: "b" }, { id: "c" }];
const buy: PanelState = { kind: "buy", askingCents: 10_000 };
const pay: PanelState = { kind: "pay", dealId: "d1" };
const waiting: PanelState = { kind: "waiting-for-payment", dealId: "d2" };
const theirStep: PanelState = { kind: "step", dealId: "d3", yourMove: false };
const myStep: PanelState = { kind: "step", dealId: "d4", yourMove: true };

test("a listing asked for in the address wins, if it is one of the thread's", () => {
  const panels = [{ listingId: "a", state: pay }];
  const messages = [{ listingId: "c" }];
  expect(pickFocus({ about: "b", listings, panels, messages })).toBe("b");
  // Somebody else's listing, or nonsense, is ignored.
  expect(pickFocus({ about: "zzz", listings, panels, messages })).toBe("a");
  expect(pickFocus({ about: ["b", "c"], listings, panels, messages })).toBe(
    "a",
  );
});

test("otherwise the one listing where it is the reader's move", () => {
  const messages = [{ listingId: "a" }, { listingId: "c" }];
  expect(
    pickFocus({
      about: undefined,
      listings,
      panels: [
        { listingId: "a", state: theirStep },
        { listingId: "b", state: myStep },
      ],
      messages,
    }),
  ).toBe("b");
});

test("otherwise the listing of the newest line", () => {
  const messages = [
    { listingId: "a" },
    { listingId: "c" },
    { listingId: null },
  ];
  // Two moves at once is not "the one": the newest line decides.
  expect(
    pickFocus({
      about: undefined,
      listings,
      panels: [
        { listingId: "a", state: pay },
        { listingId: "b", state: myStep },
      ],
      messages,
    }),
  ).toBe("c");
  expect(
    pickFocus({ about: undefined, listings, panels: [], messages: [] }),
  ).toBe("a");
  expect(
    pickFocus({ about: "a", listings: [], panels: [], messages: [] }),
  ).toBeNull();
});

test("a move is what asks the reader to act now", () => {
  expect(isYourMove(pay)).toBe(true);
  expect(isYourMove(myStep)).toBe(true);
  expect(isYourMove(theirStep)).toBe(false);
  expect(isYourMove(waiting)).toBe(false);
  expect(isYourMove(buy)).toBe(false);
  expect(
    isYourMove({
      kind: "offer-your-turn",
      offer: {
        id: "o",
        amountCents: 1,
        bySeller: true,
        effectiveStatus: "OPEN",
        expiresAt: new Date(),
      },
    }),
  ).toBe(true);
});

test("tabs are for two or more listings with something under way", () => {
  // One deal: no tabs, the panel is enough.
  expect(
    tabsFor({
      listings,
      panels: [
        { listingId: "a", state: pay },
        { listingId: "b", state: buy },
      ],
      focus: "a",
    }),
  ).toEqual([]);

  // Two: one each, in the thread's order, marked where it is your move.
  expect(
    tabsFor({
      listings,
      panels: [
        { listingId: "b", state: theirStep },
        { listingId: "a", state: pay },
        { listingId: "c", state: buy },
      ],
      focus: "b",
    }),
  ).toEqual([
    { listingId: "a", yourMove: true },
    { listingId: "b", yourMove: false },
  ]);

  // Looking at a quiet listing beside a running deal: both, so the way
  // back to the deal is one tap.
  expect(
    tabsFor({
      listings,
      panels: [
        { listingId: "a", state: waiting },
        { listingId: "c", state: buy },
      ],
      focus: "c",
    }),
  ).toEqual([
    { listingId: "a", yourMove: false },
    { listingId: "c", yourMove: false },
  ]);
});
