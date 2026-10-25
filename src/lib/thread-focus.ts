import type { PanelState } from "@/lib/deal-panel";

/**
 * Which listing an open conversation is about right now.
 *
 * A conversation is one buyer and one seller, and may be about several of
 * the seller's listings — two deals can run in it at once. The header, the
 * deal panel, the offer box and the line the message box writes about all
 * follow one listing, the focus. Pure, so the choice is pinned by tests.
 */

type Panel = { listingId: string; state: PanelState };

/** Whether a panel asks the reader to do something now. */
export function isYourMove(state: PanelState): boolean {
  switch (state.kind) {
    case "pay":
    case "start-deal":
    case "offer-your-turn":
      return true;
    case "step":
      return state.yourMove;
    default:
      return false;
  }
}

/**
 * Whether something is under way on a listing: a deal running, or an offer
 * or an acceptance waiting on somebody. Those are what get a tab.
 */
export function isUnderWay(state: PanelState): boolean {
  switch (state.kind) {
    case "pay":
    case "waiting-for-payment":
    case "step":
    case "start-deal":
    case "waiting-to-start":
    case "offer-your-turn":
    case "offer-waiting-on-them":
      return true;
    default:
      return false;
  }
}

/** Whether a deal is running on a listing: waiting to be paid, or under way. */
function isDealRunning(state: PanelState): boolean {
  return (
    state.kind === "pay" ||
    state.kind === "waiting-for-payment" ||
    state.kind === "step"
  );
}

/**
 * The first that applies: the listing asked for in the address (`?about=`),
 * if it is one of this conversation's; the one listing where it is the
 * reader's move; the one listing with a deal running; the listing of the
 * newest line; the first listing. Null for a conversation about nothing yet.
 *
 * The running deal comes before the newest line: a question about another
 * listing was turning a deal's chat, and the line typed in it, to that one.
 */
export function pickFocus(input: {
  about: string | string[] | undefined;
  listings: { id: string }[];
  panels: Panel[];
  messages: { listingId: string | null }[];
}): string | null {
  const ids = new Set(input.listings.map((listing) => listing.id));
  if (typeof input.about === "string" && ids.has(input.about)) {
    return input.about;
  }

  const moves = input.panels.filter(
    (panel) => ids.has(panel.listingId) && isYourMove(panel.state),
  );
  if (moves.length === 1) return moves[0].listingId;

  const running = input.panels.filter(
    (panel) => ids.has(panel.listingId) && isDealRunning(panel.state),
  );
  if (running.length === 1) return running[0].listingId;

  for (let i = input.messages.length - 1; i >= 0; i--) {
    const listingId = input.messages[i].listingId;
    if (listingId && ids.has(listingId)) return listingId;
  }
  return input.listings[0]?.id ?? null;
}

/**
 * The tabs above the deal panel: one for each listing with something under
 * way, in the conversation's order, and the focus among them when it is
 * not one. None when there would be only one — the panel says it all.
 */
export function tabsFor(input: {
  listings: { id: string }[];
  panels: Panel[];
  focus: string | null;
}): { listingId: string; yourMove: boolean }[] {
  const byListing = new Map(
    input.panels.map((panel) => [panel.listingId, panel.state]),
  );
  const tabs = input.listings.flatMap((listing) => {
    const state = byListing.get(listing.id);
    const shown = (state && isUnderWay(state)) || listing.id === input.focus;
    return shown
      ? [{ listingId: listing.id, yourMove: state ? isYourMove(state) : false }]
      : [];
  });
  return tabs.length > 1 ? tabs : [];
}
