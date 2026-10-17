import type { PanelStateView } from "@/components/messages/deal-panel";
import type { ThreadMessageView } from "@/components/messages/thread-view";
import type { PanelState } from "@/lib/deal-panel";
import type { ThreadMessage } from "@/server/messages";

/** The panel's state, ready to cross into the browser. */
export function toPanelView(state: PanelState): PanelStateView {
  switch (state.kind) {
    case "offer-your-turn":
    case "offer-waiting-on-them":
      return {
        kind: state.kind,
        offer: {
          ...state.offer,
          expiresAt: state.offer.expiresAt.toISOString(),
        },
      };
    case "start-deal":
      return { ...state, heldUntil: state.heldUntil.toISOString() };
    case "waiting-to-start":
      return { ...state, heldUntil: state.heldUntil.toISOString() };
    default:
      return state;
  }
}

/**
 * A thread's entries, ready to cross into the browser.
 *
 * Dates become ISO strings, the only form a server component can hand a
 * client one. Shared by the dashboard and the admin thread pages, so the two
 * cannot drift into showing the same thread differently.
 */
export function toMessageViews(messages: ThreadMessage[]): ThreadMessageView[] {
  return messages.map((message) => ({
    ...message,
    createdAt: message.createdAt.toISOString(),
    attachmentExpiresAt: message.attachmentExpiresAt?.toISOString() ?? null,
    offer: message.offer
      ? { ...message.offer, expiresAt: message.offer.expiresAt.toISOString() }
      : null,
  }));
}
