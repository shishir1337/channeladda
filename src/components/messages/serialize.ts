import type { ThreadMessageView } from "@/components/messages/thread-view";
import type { ThreadMessage } from "@/server/messages";

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
